import crypto from 'crypto';

// Public site origin used to build links inside outbound newsletter emails.
// The cron has no incoming request to derive an origin from, so this is a
// configured value with a sensible production default.
export function publicBaseUrl() {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://www.erdal-bhg.no';
}

// How long a confirmation link works, and how long an unconfirmed sign-up is
// kept before the morning cron deletes it (an address someone else may have
// entered should not be stored indefinitely).
export const NEWSLETTER_CONFIRM_DAYS = 7;
export const NEWSLETTER_PENDING_PURGE_DAYS = 30;

export function newsletterToken() {
  return crypto.randomBytes(32).toString('hex');
}

function confirmUrl(token) {
  return `${publicBaseUrl()}/nyhetsbrev?bekreft=${encodeURIComponent(token)}`;
}

function unsubscribeUrl(token) {
  return `${publicBaseUrl()}/nyhetsbrev?avmeld=${encodeURIComponent(token)}`;
}

// Double opt-in email sent right after a parent enters their address.
export function confirmationEmail({ language, confirmToken }) {
  const isNorwegian = language !== 'en';
  const link = confirmUrl(confirmToken);

  if (isNorwegian) {
    return {
      subject: 'Bekreft påmelding til nyhetsbrev fra FAU Erdal Barnehage',
      text: `Hei,

Du (eller noen som oppga din e-postadresse) har meldt seg på nyhetsbrevet til FAU Erdal Barnehage. Vi sender påminnelser om kommende arrangementer i barnehagen.

Bekreft påmeldingen ved å klikke på lenken under. Lenken virker i ${NEWSLETTER_CONFIRM_DAYS} dager.
${link}

Hvis du ikke meldte deg på, kan du bare se bort fra denne e-posten – da skjer det ingenting.

Med vennlig hilsen,
FAU Erdal Barnehage`,
    };
  }

  return {
    subject: 'Confirm your FAU Erdal Kindergarten newsletter subscription',
    text: `Hi,

You (or someone using your email address) signed up for the FAU Erdal Kindergarten newsletter. We send reminders about upcoming events at the kindergarten.

Confirm your subscription by clicking the link below. The link works for ${NEWSLETTER_CONFIRM_DAYS} days.
${link}

If you did not sign up, you can simply ignore this email and nothing will happen.

Best regards,
FAU Erdal Kindergarten`,
  };
}

// Reminder broadcast for a single flagged event/calendar entry, personalised
// per subscriber so the unsubscribe link carries their own token.
export function reminderEmail({ title, description, dateText, language, unsubscribeToken }) {
  const isNorwegian = language !== 'en';
  const link = unsubscribeUrl(unsubscribeToken);
  const body = description ? `${description}\n\n` : '';

  if (isNorwegian) {
    return {
      subject: `Påminnelse: ${title} ${dateText}`,
      text: `Hei,

Dette er en påminnelse fra FAU Erdal Barnehage.

${title} – ${dateText}

${body}Med vennlig hilsen,
FAU Erdal Barnehage

—
Du mottar denne e-posten fordi du er påmeldt nyhetsbrevet vårt. Meld deg av her: ${link}`,
    };
  }

  return {
    subject: `Reminder: ${title} ${dateText}`,
    text: `Hi,

This is a reminder from FAU Erdal Kindergarten.

${title} – ${dateText}

${body}Best regards,
FAU Erdal Kindergarten

—
You receive this email because you subscribed to our newsletter. Unsubscribe here: ${link}`,
  };
}

// Broadcast of a flagged news post. Unlike the event reminder this is not tied
// to a date — it goes out on the first evening run after an author ticks the
// "send in the newsletter" box — so it leads with the excerpt and links to the
// full post on the site.
export function newsPostEmail({ title, excerpt, postId, language, unsubscribeToken }) {
  const isNorwegian = language !== 'en';
  const link = unsubscribeUrl(unsubscribeToken);
  const postUrl = `${publicBaseUrl()}/nyheter/${postId}`;
  const body = excerpt ? `${excerpt}\n\n` : '';

  if (isNorwegian) {
    return {
      subject: `Nytt fra FAU: ${title}`,
      text: `Hei,

Det er lagt ut en ny nyhetssak fra FAU Erdal Barnehage.

${title}

${body}Les hele saken her: ${postUrl}

Med vennlig hilsen,
FAU Erdal Barnehage

—
Du mottar denne e-posten fordi du er påmeldt nyhetsbrevet vårt. Meld deg av her: ${link}`,
    };
  }

  return {
    subject: `News from FAU: ${title}`,
    text: `Hi,

A new post has been published by FAU Erdal Kindergarten.

${title}

${body}Read the full post here: ${postUrl}

Best regards,
FAU Erdal Kindergarten

—
You receive this email because you subscribed to our newsletter. Unsubscribe here: ${link}`,
  };
}

// One email for everything a subscriber has due in the same run. Without it a
// parent got a separate mail per flagged post and reminder, all at the same
// minute. Reminders come first, since they are about tomorrow; each news post
// keeps its teaser and its own link. A single item still goes out as the
// reminderEmail/newsPostEmail above.
//   items: [{ kind: 'reminder', title, description, dateText }
//          | { kind: 'news', title, excerpt, postId }]
export function digestEmail({ items, language, unsubscribeToken }) {
  const isNorwegian = language !== 'en';
  const link = unsubscribeUrl(unsubscribeToken);
  const reminders = items.filter(item => item.kind === 'reminder');
  const news = items.filter(item => item.kind === 'news');
  const first = reminders[0] || news[0];
  const more = items.length - 1;
  // One paragraph per item; an empty description or excerpt leaves no gap.
  const paragraph = (lines) => lines.filter(Boolean).join('\n');

  const sections = [];
  if (reminders.length > 0) {
    sections.push([
      isNorwegian ? 'PÅMINNELSER' : 'REMINDERS',
      ...reminders.map(item => paragraph([`${item.title} – ${item.dateText}`, item.description])),
    ].join('\n\n'));
  }
  if (news.length > 0) {
    sections.push([
      isNorwegian ? 'NYHETER' : 'NEWS',
      ...news.map(item => paragraph([
        item.title,
        item.excerpt,
        `${isNorwegian ? 'Les hele saken her' : 'Read the full post here'}: ${publicBaseUrl()}/nyheter/${item.postId}`,
      ])),
    ].join('\n\n'));
  }
  const body = sections.join('\n\n\n');

  if (isNorwegian) {
    return {
      subject: `Nytt fra FAU: ${first.title} og ${more} ${more === 1 ? 'sak' : 'saker'} til`,
      text: `Hei,

Her er det siste fra FAU Erdal Barnehage.

${body}

Med vennlig hilsen,
FAU Erdal Barnehage

—
Du mottar denne e-posten fordi du er påmeldt nyhetsbrevet vårt. Meld deg av her: ${link}`,
    };
  }

  return {
    subject: `News from FAU: ${first.title} and ${more} more`,
    text: `Hi,

Here is the latest from FAU Erdal Kindergarten.

${body}

Best regards,
FAU Erdal Kindergarten

—
You receive this email because you subscribed to our newsletter. Unsubscribe here: ${link}`,
  };
}
