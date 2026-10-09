import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contactAcknowledgementEmail,
  contactReplyEmail,
  contactSubjectLabel,
} from '../api/_shared/contact-emails.js';
import {
  confirmationEmail,
  newsPostEmail,
  digestEmail,
  publicBaseUrl,
  reminderEmail,
} from '../api/_shared/newsletter.js';
import { registrationConfirmationEmail } from '../api/_shared/registration-emails.js';

test('a council reply greets the sender and quotes their original message', () => {
  assert.equal(contactSubjectLabel('concern'), 'Bekymringsmelding');
  assert.equal(contactSubjectLabel('concern', 'en'), 'Concern');
  assert.equal(contactSubjectLabel('ukjent'), 'ukjent');

  const { subject, text } = contactReplyEmail(
    {
      name: 'Kari Nordmann',
      subject: 'general',
      message: 'Hei!\nNår er neste dugnad?',
      createdAt: '2026-05-04T09:00:00.000Z',
    },
    'Neste dugnad er 12. mai.',
  );

  assert.match(subject, /Svar på din henvendelse til FAU Erdal Barnehage: Generell henvendelse/);
  assert.match(text, /^Hei Kari Nordmann,/);
  assert.match(text, /Neste dugnad er 12\. mai\./);
  assert.match(text, /Med vennlig hilsen\nFAU Erdal Barnehage/);
  // Original inquiry is quoted back, every line prefixed.
  assert.match(text, /> Hei!\n> Når er neste dugnad\?/);

  // Anonymous-style rows have no name: fall back to a neutral greeting, and an
  // unparsable timestamp must not produce "Invalid Date" in the email.
  const withoutName = contactReplyEmail(
    { name: '', subject: 'anonymous', message: 'Anonymt tips', createdAt: 'ikke-en-dato' },
    'Takk for tipset.',
  );
  assert.match(withoutName.text, /^Hei,/);
  assert.equal(/Invalid Date/.test(withoutName.text), false);
  assert.match(withoutName.text, /Din opprinnelige henvendelse:/);
});

test('the contact receipt confirms the subject but never echoes the message', () => {
  const no = contactAcknowledgementEmail({
    name: 'Kari Nordmann',
    subject: 'general',
    receivedAt: '2026-05-04T09:00:00.000Z',
  });
  assert.match(no.subject, /Vi har mottatt din henvendelse/);
  assert.match(no.text, /^Hei Kari Nordmann,/);
  assert.match(no.text, /besvare den så snart som mulig/);
  assert.match(no.text, /Emne: Generell henvendelse/);
  assert.match(no.text, /Mottatt: /);
  assert.match(no.text, /FAU Erdal Barnehage/);

  const en = contactAcknowledgementEmail({ name: 'Kari', subject: 'feedback', language: 'en' });
  assert.match(en.subject, /We have received your inquiry/);
  assert.match(en.text, /^Hi Kari,/);
  assert.match(en.text, /Subject: Feedback/);

  // The receipt must never echo the submitted message back out: the form is
  // public and takes any recipient address, so quoting it would make the site
  // a relay for arbitrary mail.
  const withMessage = contactAcknowledgementEmail({
    name: 'Kari',
    subject: 'general',
    message: 'KJØP BILLIGE PILLER http://spam.example',
  });
  assert.equal(/spam\.example/.test(withMessage.text), false);

  // The name is the one free-text field the receipt repeats, so it goes out
  // as plain words only: no link, no line break to start a new paragraph.
  const lure = contactAcknowledgementEmail({ name: 'Kari\n\nLogg inn: https://evil.example/fau', subject: 'general' });
  assert.doesNotMatch(lure.text, /evil\.example|\/fau/);
  assert.match(lure.text, /^Hei Kari Logg inn httpsevilexamplefau,/);
  assert.match(contactAcknowledgementEmail({ name: '<>://', subject: 'general' }).text, /^Hei,/,
    'nothing left of the name means no name');

  // An unparsable timestamp must not leak "Invalid Date" into the email.
  const badDate = contactAcknowledgementEmail({ subject: 'concern', receivedAt: 'ikke-en-dato' });
  assert.equal(/Invalid Date/.test(badDate.text), false);
  assert.equal(/Mottatt:/.test(badDate.text), false);
  assert.match(badDate.text, /^Hei,/);
});

// The cron has no request to take an origin from, so every newsletter link is
// built from PUBLIC_BASE_URL. A trailing slash there used to be easy to miss.
test('newsletter links use the configured origin without a doubled slash', (t) => {
  const original = process.env.PUBLIC_BASE_URL;
  t.after(() => {
    if (original === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = original;
  });
  delete process.env.PUBLIC_BASE_URL;
  assert.equal(publicBaseUrl(), 'https://www.erdal-bhg.no');
  process.env.PUBLIC_BASE_URL = 'https://preview.example.test//';
  assert.equal(publicBaseUrl(), 'https://preview.example.test');
  assert.match(
    confirmationEmail({ confirmToken: 'abc' }).text,
    /https:\/\/preview\.example\.test\/nyhetsbrev\?bekreft=abc/,
  );
});

test('newsletter tokens are URL-encoded into the confirm and unsubscribe links', () => {
  const token = 'a+b/c=';
  const encoded = encodeURIComponent(token);
  assert.ok(confirmationEmail({ confirmToken: token }).text.includes(`bekreft=${encoded}`));
  assert.ok(reminderEmail({ title: 'Dugnad', dateText: '12. mai', unsubscribeToken: token }).text.includes(`avmeld=${encoded}`));
  assert.ok(newsPostEmail({ title: 'Nytt', postId: 7, unsubscribeToken: token }).text.includes(`avmeld=${encoded}`));
});

test('every broadcast carries an unsubscribe link, in both languages', () => {
  for (const language of ['no', 'en']) {
    const reminder = reminderEmail({ title: 'Dugnad', description: 'Ta med hansker', dateText: '12. mai', language, unsubscribeToken: 't' });
    const news = newsPostEmail({ title: 'Nytt', excerpt: 'Kort', postId: 7, language, unsubscribeToken: 't' });
    for (const email of [reminder, news]) assert.match(email.text, /nyhetsbrev\?avmeld=t/, language);
    assert.match(reminder.text, /Ta med hansker/);
    assert.match(news.text, /\/nyheter\/7/);
  }
  assert.match(confirmationEmail({ language: 'en', confirmToken: 't' }).subject, /^Confirm/);
  assert.match(confirmationEmail({ confirmToken: 't' }).subject, /^Bekreft/);
});

test('a combined newsletter email lists every item once, in both languages', () => {
  const items = [
    { kind: 'reminder', title: 'Dugnad', description: '', dateText: '12. mai' },
    { kind: 'news', title: 'Nytt', excerpt: null, postId: 7 },
  ];
  const no = digestEmail({ items, unsubscribeToken: 't' });
  assert.equal(no.subject, 'Nytt fra FAU: Dugnad og 1 sak til');
  assert.match(no.text, /Dugnad – 12\. mai/);
  assert.match(no.text, /\/nyheter\/7/);
  assert.match(no.text, /nyhetsbrev\?avmeld=t/);
  assert.doesNotMatch(no.text, /\n\n\n\n/);
  assert.match(no.text, /PÅMINNELSER\n\nDugnad – 12\. mai\n\n\nNYHETER\n\nNytt\n/);
  const en = digestEmail({ items: [...items, { kind: 'news', title: 'Mer', excerpt: 'Kort', postId: 8 }], language: 'en', unsubscribeToken: 't' });
  assert.equal(en.subject, 'News from FAU: Dugnad and 2 more');
  assert.match(en.text, /Read the full post here: .*\/nyheter\/8/);
  assert.match(en.text, /nyhetsbrev\?avmeld=t/);
});

test('an empty description or excerpt leaves no stray blank paragraph', () => {
  const reminder = reminderEmail({ title: 'Dugnad', description: '', dateText: '12. mai', unsubscribeToken: 't' });
  assert.doesNotMatch(reminder.text, /\n\n\n/);
  const news = newsPostEmail({ title: 'Nytt', excerpt: null, postId: 7, unsubscribeToken: 't' });
  assert.doesNotMatch(news.text, /\n\n\n/);
});

// MAINT-005. The most-sent mail, and the only place a parent's cancel link
// travels. The comment field is never echoed: the address is unverified.
const signupEvent = (overrides = {}) => ({
  title: 'Sommerfest', date: '2026-06-12', time: '17:00', location: 'Barnehagen', custom_location: 'Uteområdet',
  type: 'event', potluck: false, ...overrides,
});
const signupRow = (overrides = {}) => ({
  name: 'Kari Nordmann', email: 'kari@example.test', phone: null, attendee_count: 2, comments: 'Se https://evil.example',
  cancel_token: 'c'.repeat(64), children_names: null, ...overrides,
});

test('a signup confirmation names the event, its date and the cancel link, in both languages', () => {
  const no = registrationConfirmationEmail({ registration: signupRow(), event: signupEvent(), language: 'no' });
  assert.equal(no.subject, 'Påmelding bekreftet: Sommerfest');
  assert.match(no.text, /Hei Kari Nordmann,/);
  assert.match(no.text, /- Dato: 12\.6\.2026/);
  assert.match(no.text, /- Sted: Barnehagen \(Uteområdet\)/);
  assert.match(no.text, /- Telefon: Ikke oppgitt/);
  assert.match(no.text, /\/avmelding\?token=c{64}/);
  assert.doesNotMatch(no.text, /evil\.example/, 'the comment is not echoed');

  const en = registrationConfirmationEmail({ registration: signupRow({ phone: '+47 900 00 000' }), event: signupEvent({ potluck: true }), language: 'en' });
  assert.equal(en.subject, 'Registration confirmed: Sommerfest');
  assert.match(en.text, /- Date: 12\/06\/2026/);
  assert.match(en.text, /- Phone: \+47 900 00 000/);
  assert.match(en.text, /Want to change what you bring.*\/avmelding\?token=c{64}/);
});

test('a photo confirmation pairs each child with their time, in both languages', () => {
  const photo = {
    registration: signupRow({ children_names: '["Ola","<b>Kari</b>"]' }),
    event: signupEvent({ type: 'foto' }),
    photoSlots: ['09:00', '09:05'],
  };
  const no = registrationConfirmationEmail({ ...photo, language: 'no' });
  assert.equal(no.subject, 'Bekreftelse: Fotografering 12. juni 2026');
  assert.match(no.text, /Ola har fått tidspunkt 09:00\n/);
  assert.match(no.text, /har fått tidspunkt 09:05/);
  assert.doesNotMatch(no.text, /<b>/, 'names go out as plain words');
  assert.match(no.text, /\/avmelding\?token=c{64}/);

  const en = registrationConfirmationEmail({ ...photo, language: 'en' });
  assert.equal(en.subject, 'Confirmation: Photography 12 June 2026');
  assert.match(en.text, /Ola has been assigned time slot 09:00/);
});

// The event date is a calendar day. Formatted in the runtime's own zone, a
// function west of UTC wrote the day before.
test('the event date is the same day wherever the mail is written', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    assert.match(registrationConfirmationEmail({ registration: signupRow(), event: signupEvent(), language: 'no' }).text, /- Dato: 12\.6\.2026/);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
