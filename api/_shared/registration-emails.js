import { nameForMail } from './middleware.js';
import { cancellationText } from './registration-cancel.js';
import { resolvePhotoSlotsForRegistration } from '../../shared/photo-slots.js';

/**
 * The confirmation a parent gets after signing up: the most-sent mail this
 * site writes, and the only place their cancel link travels. Pure, so it is
 * tested in both languages without a mail provider (tests/emails.test.mjs).
 *
 * The address is not verified before this goes out, so the mail carries only
 * what FAU wrote plus the names, reduced by nameForMail to plain words: the
 * free-text comment is not echoed back, or the form would send anyone's words
 * (and links) to anyone from FAU's account. Council members still see the
 * comment in the registrations list.
 */

// An event date is 'YYYY-MM-DD'. Read as noon UTC and written in Oslo time, it
// names the same day wherever the function runs; `new Date(date)` with the
// runtime's own zone was a day early anywhere west of UTC. Every mail that
// names an event's day goes through here, so they all read the same.
export function eventDate(date, language, options) {
  const parsed = new Date(`${String(date).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(date ?? '');
  return parsed.toLocaleDateString(language === 'en' ? 'en-GB' : 'nb-NO', { timeZone: 'Europe/Oslo', ...options });
}

function childNames(registration, isNorwegian) {
  let names = [];
  try {
    names = JSON.parse(registration.children_names);
  } catch {}
  return (Array.isArray(names) ? names : [])
    .map((child, i) => nameForMail(child) || (isNorwegian ? `Barn ${i + 1}` : `Child ${i + 1}`));
}

/**
 * @param {{ registration: Object, event: Object, language?: string, photoSlots?: string[] }} params
 *   registration and event are database rows (snake_case).
 * @returns {{ subject: string, text: string }}
 */
export function registrationConfirmationEmail({ registration, event, language = 'no', photoSlots }) {
  const isNorwegian = language !== 'en';
  const name = nameForMail(registration.name);
  const cancellation = cancellationText({ language, cancelToken: registration.cancel_token, potluck: event.potluck });

  if (event.type === 'foto' && photoSlots && registration.children_names) {
    const children = childNames(registration, isNorwegian);
    const shortDate = eventDate(event.date, language, { day: 'numeric', month: 'long', year: 'numeric' });
    const slots = children.map((child, i) => isNorwegian
      ? `${child} har fått tidspunkt ${photoSlots[i] || 'TBD'}`
      : `${child} has been assigned time slot ${photoSlots[i] || 'TBD'}`);
    const text = isNorwegian
      ? [
        name ? `Hei ${name}` : 'Hei', '',
        `Ditt barn er nå påmeldt fotografering ${shortDate}`, '',
        ...slots, '',
        'Dersom dere av en eller annen grunn ikke kan stille, vennligst meld dere av snarest mulig, slik at tiden kan gå til andre.',
        cancellation, '',
        'Mvh', 'FAU Erdal Barnehage',
      ]
      : [
        name ? `Hi ${name}` : 'Hi', '',
        `Your child is now registered for photography on ${shortDate}`, '',
        ...slots, '',
        'If for any reason you cannot attend, please cancel as soon as possible so the slot can go to someone else.',
        cancellation, '',
        'Best regards', 'FAU Erdal Barnehage',
      ];
    return {
      subject: isNorwegian ? `Bekreftelse: Fotografering ${shortDate}` : `Confirmation: Photography ${shortDate}`,
      text: text.join('\n'),
    };
  }

  const place = `${event.location}${event.custom_location ? ` (${event.custom_location})` : ''}`;
  const date = eventDate(event.date, language);
  const text = isNorwegian ? `
Hei${name ? ` ${name}` : ''},

Din påmelding til "${event.title}" er bekreftet!

Detaljer:
- Navn: ${name}
- E-post: ${registration.email}
- Telefon: ${registration.phone || 'Ikke oppgitt'}
- Antall deltakere: ${registration.attendee_count || 1}

Arrangementsinformasjon:
- Tittel: ${event.title}
- Dato: ${date}
- Tid: ${event.time}
- Sted: ${place}

Vi ser fram til å se deg!

${cancellation}

Med vennlig hilsen,
FAU Erdal Barnehage
` : `
Hello${name ? ` ${name}` : ''},

Your registration for "${event.title}" has been confirmed!

Details:
- Name: ${name}
- Email: ${registration.email}
- Phone: ${registration.phone || 'Not provided'}
- Number of attendees: ${registration.attendee_count || 1}

Event information:
- Title: ${event.title}
- Date: ${date}
- Time: ${event.time}
- Location: ${place}

We look forward to seeing you!

${cancellation}

Best regards,
FAU Erdal Barnehage
`;
  return {
    subject: isNorwegian ? `Påmelding bekreftet: ${event.title}` : `Registration confirmed: ${event.title}`,
    text,
  };
}

// In Oslo, whatever zone the function runs in, and in the same words as the
// confirmation mail. `new Date(date)` in the runtime's zone named the day
// before anywhere west of UTC.
export function formatLongDate(dateStr, language) {
  return eventDate(dateStr, language === 'en' ? 'en' : 'no', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// "Ola: 09:00" per child, as in the confirmation mail. The stored slots are a
// JSON array; printing that raw gave `["09:00","09:10"]` with no names.
function photoSlotText(registration, isNorwegian) {
  if (!registration.photoSlots) return '';
  const slots = resolvePhotoSlotsForRegistration({ time: registration.eventTime }, registration, [registration]);
  if (slots.length === 0) return '';
  let names = [];
  try { names = JSON.parse(registration.childrenNames || '[]'); } catch {}
  if (!Array.isArray(names)) names = [];
  const lines = slots.map((slot, i) => {
    const name = nameForMail(names[i]) || (isNorwegian ? `Barn ${i + 1}` : `Child ${i + 1}`);
    return `- ${name}: ${slot}`;
  });
  return `${isNorwegian ? 'Fototidspunkt' : 'Photo slots'}:\n${lines.join('\n')}\n\n`;
}

export function registrationReminderEmail(registration) {
  const isNorwegian = registration.language !== 'en';
  const date = formatLongDate(registration.eventDate, registration.language);
  const location = registration.customLocation
    ? `${registration.location} (${registration.customLocation})`
    : registration.location;

  const cancellation = cancellationText({
    language: registration.language,
    cancelToken: registration.cancelToken,
    potluck: registration.potluck,
  });

  const subject = isNorwegian
    ? `Påminnelse: ${registration.eventTitle} i morgen`
    : `Reminder: ${registration.eventTitle} tomorrow`;

  const text = isNorwegian ? `
Hei ${registration.name},

Dette er en påminnelse om at du er påmeldt "${registration.eventTitle}" i morgen.

Arrangementsinformasjon:
- Dato: ${date}
- Tid: ${registration.eventTime}
- Sted: ${location}
- Antall deltakere: ${registration.attendeeCount || 1}

${photoSlotText(registration, true)}Vi gleder oss til å se deg!

${cancellation}

Med vennlig hilsen,
FAU Erdal Barnehage
` : `
Hi ${registration.name},

This is a reminder that you are registered for "${registration.eventTitle}" tomorrow.

Event information:
- Date: ${date}
- Time: ${registration.eventTime}
- Location: ${location}
- Number of attendees: ${registration.attendeeCount || 1}

${photoSlotText(registration, false)}We look forward to seeing you!

${cancellation}

Best regards,
FAU Erdal Barnehage
`;

  return { subject, text };
}
