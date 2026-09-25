// Public event signup is anonymous and CSRF-free, so its business rules are
// the only thing between one scripted request and a whole event: the attendee
// cap, a named child per photo slot, the day's slots as the photo limit, and
// what the confirmation mail is allowed to repeat back.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test, { mock } from 'node:test';
import nodemailer from 'nodemailer';
import { call, importHandler, scriptedSql, useDatabase } from './helpers.mjs';
import { SIGNUP_ERROR_CODES } from '../shared/constants.js';

Object.assign(process.env, { GMAIL_USER: 'fau@example.test', GMAIL_APP_PASSWORD: 'fixture' });
const sent = [];
mock.method(nodemailer, 'createTransport', () => ({ close() {}, sendMail: async (message) => { sent.push(message); } }));
const handler = await importHandler('api/registrations.js');

const PUBLIC_MAIL_KEY = crypto.createHash('sha256').update('public-mail').digest('hex');

function eventRow(overrides = {}) {
  return {
    id: 7, title: 'Dugnad', date: '2099-10-01', time: '17:00', location: 'Barnehagen', custom_location: null,
    max_attendees: 30, current_attendees: 0, registration_deadline: null, type: 'dugnad',
    no_signup: false, vigilo_signup: false, ...overrides,
  };
}

// Answers the event lookup, the photo-slot snapshot and the signup statement
// the way PostgreSQL would for a successful insert.
function signupDatabase({ event = eventRow(), existing = [], rateCount = 1 } = {}) {
  return useDatabase(scriptedSql({
    rateCount,
    respond(statement) {
      if (statement.startsWith('SELECT id, title, date, time')) return [event];
      if (statement.startsWith('SELECT id, attendee_count as "attendeeCount"')) return existing;
      if (statement.startsWith('WITH target_event AS')) {
        return [{
          eventExists: 1, capacityAvailable: true, available: 10, reservedSlotCount: 0, event,
          registration: {
            id: 1, event_id: event.id, name: 'Kari', email: 'kari@example.test', phone: '', attendee_count: 1,
            comments: 'Klikk https://evil.example/login for premie', language: 'no', children_names: null, cancel_token: 'c'.repeat(64),
          },
        }];
      }
      return [];
    },
  }));
}

const signup = (body) => ({ method: 'POST', body: { eventId: 7, name: 'Kari', email: 'kari@example.test', ...body }, csrf: false });
const signupStatement = (sql) => sql.calls.find(({ statement }) => statement.startsWith('WITH target_event AS'));

test('attendee count is capped server-side and must be a whole number', async (t) => {
  for (const attendeeCount of [11, 100, 0, 2.5, '3x', -1]) {
    const sql = signupDatabase();
    const res = await call(t, handler, signup({ attendeeCount }));
    assert.equal(res.statusCode, 400, String(attendeeCount));
    assert.equal(signupStatement(sql), undefined, `${attendeeCount} reached the database`);
  }
  for (const [attendeeCount, stored] of [[undefined, 1], [10, 10], ['4', 4]]) {
    const sql = signupDatabase();
    const res = await call(t, handler, signup({ attendeeCount }));
    assert.equal(res.statusCode, 201, String(attendeeCount));
    assert.ok(signupStatement(sql).values.includes(stored), `${attendeeCount} stored as ${stored}`);
  }
});

test('a photo booking names every child it books a slot for', async (t) => {
  const foto = eventRow({ type: 'foto', time: '09:00' });
  for (const childrenNames of [undefined, JSON.stringify(['Ola']), JSON.stringify(['Ola', ' '])]) {
    const sql = signupDatabase({ event: foto });
    const res = await call(t, handler, signup({ attendeeCount: 2, childrenNames }));
    assert.equal(res.statusCode, 400, String(childrenNames));
    assert.equal(signupStatement(sql), undefined);
  }
  const sql = signupDatabase({ event: foto });
  const res = await call(t, handler, signup({ attendeeCount: 2, childrenNames: JSON.stringify(['Ola', 'Kari']) }));
  assert.equal(res.statusCode, 201);
  assert.ok(signupStatement(sql).values.includes(JSON.stringify(['09:00', '09:05'])));
});

test('a photo day with too few free slots refuses instead of booking a child with no time', async (t) => {
  // 23:50 leaves two five-minute slots before midnight.
  const sql = signupDatabase({ event: eventRow({ type: 'foto', time: '23:50' }) });
  const res = await call(t, handler, signup({ attendeeCount: 3, childrenNames: JSON.stringify(['A', 'B', 'C']) }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'PHOTO_SLOTS_FULL');
  assert.equal(signupStatement(sql), undefined);
});

// Mail goes out after the response (waitUntil), so let it settle first.
test('the confirmation does not repeat the free-text comment to an unverified address', async (t) => {
  sent.length = 0;
  signupDatabase();
  const res = await call(t, handler, signup({ comments: 'Klikk https://evil.example/login for premie' }));
  await new Promise(setImmediate);
  assert.equal(res.statusCode, 201);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'kari@example.test');
  assert.doesNotMatch(sent[0].text, /evil\.example|premie/);
  assert.match(sent[0].text, /avmelding\?token=c{64}/);
});

test('past the daily public-mail cap the signup is kept but no mail is sent', async (t) => {
  sent.length = 0;
  const sql = signupDatabase({ rateCount: (key) => (key === PUBLIC_MAIL_KEY ? 999 : 1) });
  const res = await call(t, handler, signup({}));
  await new Promise(setImmediate);
  assert.equal(res.statusCode, 201);
  assert.ok(signupStatement(sql), 'the registration is still stored');
  assert.equal(sent.length, 0);
});

// With TURNSTILE_SECRET_KEY set, a signup must carry a token Cloudflare
// accepts; Cloudflare is stubbed at the network boundary.
test('with Turnstile on, a signup without a valid token is refused before anything is written', async (t) => {
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  t.after(() => { delete process.env.TURNSTILE_SECRET_KEY; });
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const { response } = JSON.parse(init.body);
    asked.push(response);
    return Response.json(response === 'good-token'
      ? { success: true, 'error-codes': [] }
      : { success: false, 'error-codes': ['invalid-input-response'] });
  });

  for (const turnstileToken of [undefined, 'bad-token']) {
    const sql = signupDatabase();
    const res = await call(t, handler, signup({ turnstileToken }));
    assert.equal(res.statusCode, 400, String(turnstileToken));
    assert.equal(res.body.code, 'TURNSTILE_FAILED');
    assert.equal(signupStatement(sql), undefined);
  }

  const sql = signupDatabase();
  const res = await call(t, handler, signup({ turnstileToken: 'good-token' }));
  assert.equal(res.statusCode, 201);
  assert.ok(signupStatement(sql));
  assert.deepEqual(asked, ['bad-token', 'good-token'], 'a missing token never reaches Cloudflare');
});

// SEC-005. parseInt read an eventId of 1.5 or '7abc' as a real event.
test('an event id that is not a whole number is refused', async (t) => {
  for (const eventId of [1.5, '7abc', '', true, [7]]) {
    const sql = signupDatabase();
    const res = await call(t, handler, signup({ eventId }));
    assert.equal(res.statusCode, 400, JSON.stringify(eventId));
    assert.equal(signupStatement(sql), undefined, JSON.stringify(eventId));
  }
  for (const eventId of ['1.5', '7abc']) {
    useDatabase(scriptedSql());
    const res = await call(t, handler, { query: { eventId } });
    assert.equal(res.statusCode, 400, `GET ?eventId=${eventId}`);
  }
  const sql = useDatabase(scriptedSql());
  const res = await call(t, handler, { method: 'DELETE', query: { id: '1.5' }, as: 'member' });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(sql.writes(), []);
});

// TRACE-004. The form used to pick its message by matching substrings of the
// English error text, and showed anything it did not recognise untranslated.
test('every refusal names its reason with a code the signup form translates', async (t) => {
  const refused = (state) => ({ eventExists: 1, capacityAvailable: true, available: 0, reservedSlotCount: 0, registration: null, ...state });
  const cases = [
    ['INVALID_SIGNUP', {}, { name: '' }],
    ['ATTENDEES_OUT_OF_RANGE', {}, { attendeeCount: 11 }],
    ['EVENT_INACTIVE', { event: null }, {}],
    ['SIGNUP_CLOSED', { event: eventRow({ no_signup: true }) }, {}],
    ['DEADLINE_PASSED', { event: eventRow({ registration_deadline: '2000-01-01T00:00:00.000Z' }) }, {}],
    ['CHILD_NAMES_REQUIRED', { event: eventRow({ type: 'foto' }) }, {}],
    ['EVENT_FULL', { state: refused({ capacityAvailable: false }) }, {}],
    ['ALREADY_REGISTERED', { state: refused({}) }, {}],
    ['RATE_LIMITED', { rateCount: 999 }, {}],
  ];
  for (const [code, { event = eventRow(), state, rateCount = 1 }, body] of cases) {
    useDatabase(scriptedSql({
      rateCount,
      respond(statement) {
        if (statement.startsWith('SELECT id, title, date, time')) return event ? [event] : [];
        if (statement.startsWith('WITH target_event AS')) return [state];
        return [];
      },
    }));
    const res = await call(t, handler, signup(body));
    assert.ok(res.statusCode >= 400, code);
    assert.equal(res.body.code, code);
    assert.equal(typeof res.body.error, 'string', `${code} keeps a readable fallback`);
  }
});

// The form's translations are typed Record<SignupErrorCode, string>, so a code
// missing from the list would reach parents as the generic message.
test('the codes the API refuses a signup with are exactly the ones the form translates', () => {
  const source = readFileSync(new URL('../api/registrations.js', import.meta.url), 'utf8');
  const used = new Set([...source.matchAll(/refuseSignup\(res, \d{3}, '([A-Z_]+)'/g)].map((match) => match[1]));
  assert.deepEqual([...used].sort(), [...SIGNUP_ERROR_CODES].sort());
});
