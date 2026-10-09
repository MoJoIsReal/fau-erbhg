import { nameForMail } from './middleware.js';
import { cancellationText } from './registration-cancel.js';

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
// runtime's own zone was a day early anywhere west of UTC.
function eventDate(date, language, options) {
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
