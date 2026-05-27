import crypto from 'crypto';

// Public site origin used to build links inside outbound newsletter emails.
// The cron has no incoming request to derive an origin from, so this is a
// configured value with a sensible production default.
export function publicBaseUrl() {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://www.erdal-bhg.no';
}

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

Bekreft påmeldingen ved å klikke på lenken under:
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

Confirm your subscription by clicking the link below:
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
