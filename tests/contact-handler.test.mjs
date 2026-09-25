// The contact form and newsletter sign-up are the site's public, CSRF-free
// write paths. Their protection is ordering: honeypot, size and rate limits
// first, and nothing stored or revealed that the posture promises not to.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { mock } from 'node:test';
import nodemailer from 'nodemailer';
import { call, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

// Mail is configured, and every message is captured instead of sent.
Object.assign(process.env, { GMAIL_USER: 'fau@example.test', GMAIL_APP_PASSWORD: 'fixture' });
const sent = [];
mock.method(nodemailer, 'createTransport', () => ({ close() {}, sendMail: async (message) => { sent.push(message); } }));
const handler = await importHandler('api/contact.js');

const TOKEN = 'ab'.repeat(32);
const submit = (body, query = {}) => ({ method: 'POST', query, body, csrf: false });
const inserts = (sql) => sql.writes().filter(({ statement }) => statement.startsWith('INSERT INTO contact_messages'));

test('a filled honeypot is accepted silently and touches nothing', async (t) => {
  for (const query of [{}, { action: 'newsletter-subscribe' }]) {
    const sql = useDatabase(scriptedSql());
    const res = await call(t, handler, submit({ subject: 'general', message: 'Hei', email: 'a@example.test', website: 'x' }, query));
    assert.equal(res.statusCode, 204, JSON.stringify(query));
    assert.deepEqual(sql.calls, []);
  }
});

test('an oversized body or unknown subject is refused before the database', async (t) => {
  for (const [body, status] of [
    [{ subject: 'general', message: 'x'.repeat(70_000) }, 413],
    [{ subject: 'spam', message: 'Hei' }, 400],
    [{ subject: 'general' }, 400],
  ]) {
    const sql = useDatabase(scriptedSql());
    assert.equal((await call(t, handler, submit(body))).statusCode, status);
    assert.deepEqual(sql.calls, []);
  }
});

test('an exhausted IP limit refuses with Retry-After and stores nothing', async (t) => {
  const sql = useDatabase(scriptedSql({ rateCount: 99 }));
  const res = await call(t, handler, submit({ subject: 'general', name: 'Kari', email: 'kari@example.test', message: 'Hei' }));
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '60');
  assert.deepEqual(inserts(sql), []);
});

test('an anonymous tip stores no name or email, whatever the form sent', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: () => [{ id: 1 }] }));
  const res = await call(t, handler, submit({
    subject: 'anonymous', name: 'Kari Nordmann', email: 'kari@example.test', message: 'Noe dere bør vite',
  }));
  assert.equal(res.statusCode, 201);
  const [insert] = inserts(sql);
  assert.deepEqual(insert.values.slice(0, 2), ['', '']);
  assert.equal(insert.values[3], 'anonymous');
});

test('a named inquiry needs a valid address and is stored sanitized', async (t) => {
  const invalid = useDatabase(scriptedSql());
  const refused = await call(t, handler, submit({ subject: 'general', name: 'Kari', email: 'not-an-address', message: 'Hei' }));
  assert.equal(refused.statusCode, 400);
  assert.deepEqual(inserts(invalid), []);

  const sql = useDatabase(scriptedSql({ respond: () => [{ id: 1 }] }));
  const res = await call(t, handler, submit({
    subject: 'concern', name: 'Kari', email: ' Kari@Example.TEST ', message: 'Hei<script>alert(1)</script> der',
  }));
  assert.equal(res.statusCode, 201);
  const [{ values: [name, email, , subject, message, createdAt] }] = inserts(sql);
  assert.deepEqual([name, email, subject], ['Kari', 'kari@example.test', 'concern']);
  assert.doesNotMatch(message, /<script/i);
  // TRACE-003: ISO text, not NOW()'s '2026-09-24 11:56:00.123456+00'.
  assert.match(createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

// Mail goes out after the response (waitUntil), so let it settle first.
test('the council hears about every inquiry; only a named sender gets a receipt', async (t) => {
  for (const [subject, recipients] of [['anonymous', ['fau@example.test']], ['general', ['fau@example.test', 'kari@example.test']]]) {
    sent.length = 0;
    useDatabase(scriptedSql({ respond: () => [{ id: 1, created_at: '2026-05-04T09:00:00.000Z' }] }));
    await call(t, handler, submit({ subject, name: 'Kari', email: 'kari@example.test', message: 'Hei' }));
    await new Promise(setImmediate);
    assert.deepEqual(sent.map(({ to }) => to).sort(), recipients, subject);
    if (subject === 'anonymous') assert.doesNotMatch(sent[0].text, /Kari|kari@/, 'an anonymous tip names no one');
  }
});

// Double opt-in must not become a way to learn who is subscribed.
test('subscribing answers the same for a new, pending or already active address', async (t) => {
  const publicMail = crypto.createHash('sha256').update('public-mail').digest('hex');
  const answers = [];
  for (const existing of [null, 'pending', 'unsubscribed', 'active']) {
    const sql = useDatabase(scriptedSql({
      // PostgreSQL's answer to the upsert: the row when it inserted or re-armed
      // one, nothing when the address was already active.
      respond: (statement) => (statement.startsWith('INSERT INTO newsletter_subscribers') && existing !== 'active'
        ? [{ id: 4 }]
        : []),
    }));
    const res = await call(t, handler, submit({ email: 'kari@example.test' }, { action: 'newsletter-subscribe' }));
    answers.push([res.statusCode, res.body]);

    const [upsert, ...others] = sql.writes();
    assert.deepEqual(others, [], 'one statement, so there is no lookup for a second request to slip past');
    assert.match(upsert.statement, /ON CONFLICT \(email\) DO UPDATE SET status = 'pending'.* WHERE newsletter_subscribers\.status <> 'active' RETURNING id$/);
    assert.ok(upsert.values.some((value) => /^[a-f0-9]{64}$/.test(value)), 'a fresh confirm token');
    const mailed = sql.calls.some(({ statement, values }) => statement.startsWith('INSERT INTO api_rate_limits') && values[0] === publicMail);
    assert.equal(mailed, existing !== 'active', `${existing ?? 'new'}: an active subscription gets no new mail`);
  }
  assert.deepEqual(answers, Array(4).fill([200, { success: true }]));
});

test('confirm and unsubscribe reject a malformed token before any lookup', async (t) => {
  for (const action of ['newsletter-confirm', 'newsletter-unsubscribe']) {
    for (const token of [undefined, '', 'abc', 'AB'.repeat(32), `${TOKEN}0`]) {
      const sql = useDatabase(scriptedSql());
      assert.equal((await call(t, handler, submit({ token }, { action }))).statusCode, 400, `${action} ${token}`);
      assert.deepEqual(sql.calls, []);
    }
  }
});

test('confirm activates only a pending subscription; unsubscribe never reveals a match', async (t) => {
  const confirm = useDatabase(scriptedSql());
  assert.equal((await call(t, handler, submit({ token: TOKEN }, { action: 'newsletter-confirm' }))).statusCode, 400);
  assert.match(confirm.writes()[0].statement, /WHERE confirm_token = \? AND status = 'pending'/);

  for (const matched of [[], [{ id: 4 }]]) {
    useDatabase(scriptedSql({ respond: () => matched }));
    const res = await call(t, handler, submit({ token: TOKEN }, { action: 'newsletter-unsubscribe' }));
    assert.deepEqual([res.statusCode, res.body], [200, { success: true }]);
  }
});

// Every mail these forms trigger shares one daily Gmail quota with the
// scheduled reminders; past the cap the inquiry is kept and mail is skipped.
test('past the daily public-mail cap an inquiry is stored but no mail goes out', async (t) => {
  sent.length = 0;
  const cap = crypto.createHash('sha256').update('public-mail').digest('hex');
  const sql = useDatabase(scriptedSql({
    rateCount: (key) => (key === cap ? 999 : 1),
    respond: () => [{ id: 1, created_at: '2026-05-04T09:00:00.000Z' }],
  }));
  const res = await call(t, handler, submit({ subject: 'general', name: 'Kari', email: 'kari@example.test', message: 'Hei' }));
  await new Promise(setImmediate);
  assert.equal(res.statusCode, 201);
  assert.equal(inserts(sql).length, 1);
  assert.deepEqual(sent, []);
});

// With TURNSTILE_SECRET_KEY set, the contact form and newsletter signup need a
// token Cloudflare accepts. The e-mailed confirm/unsubscribe links carry their
// own secret and must keep working without one.
test('with Turnstile on, the two forms need a valid token and the e-mailed links do not', async (t) => {
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  t.after(() => { delete process.env.TURNSTILE_SECRET_KEY; });
  t.mock.method(globalThis, 'fetch', async (_url, init) => Response.json(
    JSON.parse(init.body).response === 'good-token'
      ? { success: true, 'error-codes': [] }
      : { success: false, 'error-codes': ['timeout-or-duplicate'] },
  ));

  const forms = [
    [{ subject: 'general', name: 'Kari', email: 'kari@example.test', message: 'Hei' }, {}, 201],
    [{ email: 'kari@example.test' }, { action: 'newsletter-subscribe' }, 200],
  ];
  for (const [body, query, okStatus] of forms) {
    const form = query.action ?? 'contact';
    for (const turnstileToken of [undefined, 'stale-token']) {
      const sql = useDatabase(scriptedSql({ respond: () => [{ id: 1, created_at: '2026-05-04T09:00:00.000Z' }] }));
      const res = await call(t, handler, submit({ ...body, turnstileToken }, query));
      assert.equal(res.statusCode, 400, `${form} ${turnstileToken}`);
      assert.equal(res.body.code, 'TURNSTILE_FAILED');
      assert.deepEqual(sql.writes(), [], `${form} wrote nothing`);
    }
    useDatabase(scriptedSql({ respond: () => [{ id: 1, created_at: '2026-05-04T09:00:00.000Z' }] }));
    const accepted = await call(t, handler, submit({ ...body, turnstileToken: 'good-token' }, query));
    assert.equal(accepted.statusCode, okStatus, form);
  }

  for (const action of ['newsletter-confirm', 'newsletter-unsubscribe']) {
    useDatabase(scriptedSql({ respond: () => [{ id: 4 }] }));
    const res = await call(t, handler, submit({ token: TOKEN }, { action }));
    assert.equal(res.statusCode, 200, action);
  }
});
