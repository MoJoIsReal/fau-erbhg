import { publicBaseUrl } from './newsletter.js';

// Norwegian labels for the subject values the public contact form submits.
// Mirrors getSubjectLabel() in client/src/pages/messages.tsx.
const CONTACT_SUBJECT_LABELS = {
  anonymous: 'Anonym henvendelse',
  general: 'Generell henvendelse',
  concern: 'Bekymringsmelding',
  feedback: 'Tilbakemelding',
};

export const CONTACT_REPLY_MAX_LENGTH = 5000;

export function contactSubjectLabel(subject) {
  return CONTACT_SUBJECT_LABELS[subject] || subject;
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

  // created_at is stored as text; be defensive about anything Date can't parse
  // so a formatting slip never blocks a reply from going out.
  const submittedDate = original.createdAt ? new Date(original.createdAt) : null;
  const submitted = submittedDate && !Number.isNaN(submittedDate.getTime())
    ? submittedDate.toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })
    : '';

  const quoted = String(original.message || '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  return {
    subject: `Svar på din henvendelse til FAU Erdal Barnehage: ${contactSubjectLabel(original.subject)}`,
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
