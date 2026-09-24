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
  publicBaseUrl,
  reminderEmail,
} from '../api/_shared/newsletter.js';

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

test('an empty description or excerpt leaves no stray blank paragraph', () => {
  const reminder = reminderEmail({ title: 'Dugnad', description: '', dateText: '12. mai', unsubscribeToken: 't' });
  assert.doesNotMatch(reminder.text, /\n\n\n/);
  const news = newsPostEmail({ title: 'Nytt', excerpt: null, postId: 7, unsubscribeToken: 't' });
  assert.doesNotMatch(news.text, /\n\n\n/);
});
