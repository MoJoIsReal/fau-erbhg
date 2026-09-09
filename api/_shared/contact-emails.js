import { publicBaseUrl } from './newsletter.js';

// Labels for the subject values the public contact form submits.
// Mirrors getSubjectLabel() in client/src/pages/messages.tsx.
const CONTACT_SUBJECT_LABELS = {
  no: {
    anonymous: 'Anonym henvendelse',
    general: 'Generell henvendelse',
    concern: 'Bekymringsmelding',
    feedback: 'Tilbakemelding',
  },
  en: {
    anonymous: 'Anonymous inquiry',
    general: 'General inquiry',
    concern: 'Concern',
    feedback: 'Feedback',
  },
};

export const CONTACT_REPLY_MAX_LENGTH = 5000;

export function contactSubjectLabel(subject, language = 'no') {
  const labels = language === 'en' ? CONTACT_SUBJECT_LABELS.en : CONTACT_SUBJECT_LABELS.no;
  return labels[subject] || subject;
}

// Joins body lines, collapsing the double blank line left behind when an
// optional line (e.g. an unparsable timestamp) drops out.
function joinLines(lines) {
  return lines
    .filter((line, index) => !(line === '' && lines[index - 1] === ''))
    .join('\n');
}

function osloTimestamp(value, language = 'no') {
  // Dates are stored as text; be defensive about anything Date can't parse so a
  // formatting slip never blocks an email from going out.
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(language === 'en' ? 'en-GB' : 'nb-NO', { timeZone: 'Europe/Oslo' });
}

/**
 * Receipt sent to the person who submitted the contact form, so they know the
 * inquiry arrived and that an answer is coming. Sent from FAU's own Gmail
 * address, which means a reply to it lands back in FAU's inbox.
 *
 * Deliberately does NOT quote the submitted message: the form is public and
 * accepts any recipient address, so echoing attacker-supplied text back out
 * would turn the site into a relay for arbitrary mail. Only the validated
 * subject value and a server-side timestamp are included.
 *
 * @param {{ name?: string, subject: string, language?: string, receivedAt?: string }} params
 * @returns {{ subject: string, text: string }}
 */
export function contactAcknowledgementEmail({ name, subject, language = 'no', receivedAt } = {}) {
  const isNorwegian = language !== 'en';
  const received = osloTimestamp(receivedAt, isNorwegian ? 'no' : 'en');

  if (isNorwegian) {
    return {
      subject: 'Vi har mottatt din henvendelse – FAU Erdal Barnehage',
      text: joinLines([
        name ? `Hei ${name},` : 'Hei,',
        '',
        'Takk for at du tok kontakt med FAU Erdal Barnehage. Vi har mottatt henvendelsen din, og vi vil ta kontakt og besvare den så snart som mulig.',
        '',
        `Emne: ${contactSubjectLabel(subject, 'no')}`,
        received ? `Mottatt: ${received}` : '',
        '',
        'FAU er en gruppe frivillige foreldre, så det kan ta noen dager før du hører fra oss.',
        '',
        'Dette er en automatisk bekreftelse, men du kan svare direkte på denne e-posten hvis du har noe å legge til.',
        '',
        'Med vennlig hilsen',
        'FAU Erdal Barnehage',
        publicBaseUrl(),
        '',
      ]),
    };
  }

  return {
    subject: 'We have received your inquiry – FAU Erdal Kindergarten',
    text: joinLines([
      name ? `Hi ${name},` : 'Hi,',
      '',
      'Thank you for contacting FAU Erdal Kindergarten. We have received your inquiry and will get back to you as soon as possible.',
      '',
      `Subject: ${contactSubjectLabel(subject, 'en')}`,
      received ? `Received: ${received}` : '',
      '',
      'FAU is a group of volunteer parents, so it may take a few days before you hear from us.',
      '',
      'This is an automatic confirmation, but you are welcome to reply directly to this email if you have anything to add.',
      '',
      'Best regards,',
      'FAU Erdal Kindergarten',
      publicBaseUrl(),
      '',
    ]),
  };
}

/**
 * Build the reply FAU sends back to a contact-form inquiry. Sent from FAU's own
 * Gmail address (the transporter default) to the address given in the inquiry.
 * Plain text, with the original inquiry quoted underneath so the parent has the
 * context of what they are being answered about.
 *
 * @param {{ name?: string, subject: string, message: string, createdAt?: string }} original
 * @param {string} reply - Sanitized reply body written by the admin.
 * @returns {{ subject: string, text: string }}
 */
export function contactReplyEmail(original, reply) {
  const greeting = original.name ? `Hei ${original.name},` : 'Hei,';

  const submitted = original.createdAt ? osloTimestamp(original.createdAt) : '';

  const quoted = String(original.message || '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  return {
    subject: `Svar på din henvendelse til FAU Erdal Barnehage: ${contactSubjectLabel(original.subject, 'no')}`,
    text: [
      greeting,
      '',
      reply,
      '',
      'Med vennlig hilsen',
      'FAU Erdal Barnehage',
      '',
      '---',
      `Du får denne e-posten fordi du sendte inn en henvendelse via kontaktskjemaet på ${publicBaseUrl()}.`,
      '',
      submitted ? `Din opprinnelige henvendelse (${submitted}):` : 'Din opprinnelige henvendelse:',
      quoted,
      '',
    ].join('\n'),
  };
}
