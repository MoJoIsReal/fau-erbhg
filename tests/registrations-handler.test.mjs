// Public event signup is anonymous and CSRF-free, so its business rules are
// the only thing between one scripted request and a whole event: the attendee
// cap, a named child per photo slot, the day's slots as the photo limit, and
// what the confirmation mail is allowed to repeat back.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { mock } from 'node:test';
import nodemailer from 'nodemailer';
import { call, importHandler, scriptedSql, useDatabase, settle } from './helpers.mjs';
import { rateLimitDigest } from '../api/_shared/rate-limit.js';
import { SIGNUP_ERROR_CODES } from '../shared/constants.js';

Object.assign(process.env, { GMAIL_USER: 'fau@example.test', GMAIL_APP_PASSWORD: 'fixture' });
const sent = [];
mock.method(nodemailer, 'createTransport', () => ({ close() {}, sendMail: async (message) => { sent.push(message); } }));
const handler = await importHandler('api/registrations.js');

const PUBLIC_MAIL_KEY = rateLimitDigest(['public-mail']);

function eventRow(overrides = {}) {
  return {
    id: 7, title: 'Dugnad', date: '2099-10-01', time: '17:00', location: 'Barnehagen', custom_location: null,
    max_attendees: 30, current_attendees: 0, registration_deadline: null, type: 'dugnad',
    no_signup: false, vigilo_signup: false, ...overrides,
  };
}

// Answers the event lookup, the photo-slot snapshot and the signup statement
// the way PostgreSQL would for a successful insert.
function signupDatabase({ event = eventRow(), existing = [], rateCount = 1, registration = {} } = {}) {
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
            ...registration,
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
    const others = Array.from({ length: stored - 1 }, (_, i) => `Gjest ${i + 2}`);
    const res = await call(t, handler, signup({ attendeeCount, childrenNames: JSON.stringify(others) }));
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

test('a signup for several people names everyone besides the registrant', async (t) => {
  for (const childrenNames of [undefined, '', 'not json', JSON.stringify(['Ola']), JSON.stringify(['Ola', ' ']), JSON.stringify(['', 'Ola', 'Per'])]) {
    const sql = signupDatabase();
    const res = await call(t, handler, signup({ attendeeCount: 3, childrenNames }));
    assert.equal(res.statusCode, 400, String(childrenNames));
    assert.equal(res.body.code, 'ATTENDEE_NAMES_REQUIRED');
    assert.equal(signupStatement(sql), undefined, `${childrenNames} reached the database`);
  }

  let sql = signupDatabase();
  let res = await call(t, handler, signup({ attendeeCount: 3, childrenNames: JSON.stringify([' Ola <b>', 'Per', 'Extra']) }));
  assert.equal(res.statusCode, 201);
  assert.ok(signupStatement(sql).values.includes(JSON.stringify(['Ola b', 'Per'])), 'stored sanitized, one name per other attendee');

  // Signing up alone names nobody else, whatever the request carried.
  sql = signupDatabase();
  res = await call(t, handler, signup({ attendeeCount: 1, childrenNames: JSON.stringify(['Ola']) }));
  assert.equal(res.statusCode, 201);
  assert.equal(signupStatement(sql).values.includes(JSON.stringify(['Ola'])), false);
});

test('a potluck signup must say what food it brings; any other signup stores none', async (t) => {
  const kurvfest = eventRow({ type: 'foreldrefest', potluck: true });
  for (const foodContribution of [undefined, '', '   ', 42]) {
    const sql = signupDatabase({ event: kurvfest });
    const res = await call(t, handler, signup({ foodContribution }));
    assert.equal(res.statusCode, 400, JSON.stringify(foodContribution));
    assert.equal(res.body.code, 'FOOD_CONTRIBUTION_REQUIRED');
    assert.equal(signupStatement(sql), undefined, `${JSON.stringify(foodContribution)} reached the database`);
  }

  let sql = signupDatabase({ event: kurvfest });
  let res = await call(t, handler, signup({ foodContribution: ' Pastasalat <b>' }));
  assert.equal(res.statusCode, 201);
  assert.ok(signupStatement(sql).values.includes('Pastasalat b'), 'stored sanitized');

  sql = signupDatabase({ event: eventRow({ type: 'foreldrefest', potluck: false }) });
  res = await call(t, handler, signup({ foodContribution: 'Pastasalat' }));
  assert.equal(res.statusCode, 201);
  assert.equal(signupStatement(sql).values.includes('Pastasalat'), false, 'an event that does not ask stores nothing');
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
  await settle();
  sent.length = 0;
  signupDatabase();
  const res = await call(t, handler, signup({ comments: 'Klikk https://evil.example/login for premie' }));
  await settle();
  assert.equal(res.statusCode, 201);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'kari@example.test');
  assert.doesNotMatch(sent[0].text, /evil\.example|premie/);
  assert.match(sent[0].text, /avmelding\?token=c{64}/);
  // When the mail goes out, the link travels only in it, and the answer is
  // an allow-list rather than the stored row.
  assert.deepEqual(res.body, { id: 1, eventId: 7, attendeeCount: 1, confirmationEmail: true });
  assert.equal(res.body.confirmationEmail, true);
  assert.equal('cancelUrl' in res.body, false);
  assert.equal('cancel_token' in res.body, false);
});

// The name is kept in the greeting, but only as plain words: anyone can sign
// up with anyone's address, so a name must not carry a link or a paragraph.
test('the confirmation repeats the name only as plain words', async (t) => {
  await settle();
  sent.length = 0;
  const lure = 'Ola\n\nVIKTIG: https://evil.example/refusjon';
  signupDatabase({ registration: { name: lure } });
  const res = await call(t, handler, signup({ name: lure }));
  await settle();
  assert.equal(res.statusCode, 201);
  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].text, /evil\.example|\/refusjon/);
  assert.match(sent[0].text, /Hei Ola VIKTIG httpsevilexamplerefusjon,/);

  await settle();
  sent.length = 0;
  signupDatabase({ registration: { name: 'Anne-Marie Ødegård' } });
  await call(t, handler, signup({ name: 'Anne-Marie Ødegård' }));
  await settle();
  assert.match(sent[0].text, /Hei Anne-Marie Ødegård,/);
});

test('past the daily public-mail cap the signup is kept but no mail is sent', async (t) => {
  await settle();
  sent.length = 0;
  const sql = signupDatabase({ rateCount: (key) => (key === PUBLIC_MAIL_KEY ? 999 : 1) });
  const res = await call(t, handler, signup({}));
  await settle();
  assert.equal(res.statusCode, 201);
  assert.ok(signupStatement(sql), 'the registration is still stored');
  assert.equal(sent.length, 0);
  // The mail held the only link to the signup, so the page gets it instead.
  assert.equal(res.body.confirmationEmail, false);
  assert.match(res.body.cancelUrl, /\/avmelding\?token=c{64}$/);
  assert.equal('cancel_token' in res.body, false);
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
    ['ATTENDEE_NAMES_REQUIRED', {}, { attendeeCount: 2 }],
    ['FOOD_CONTRIBUTION_REQUIRED', { event: eventRow({ type: 'foreldrefest', potluck: true }) }, { foodContribution: '  ' }],
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
  // Refused in the handler, or by validateSignupBody / validateSignupForEvent.
  const used = new Set([...source.matchAll(/refuseSignup\(res, \d{3}, '([A-Z_]+)'|\bcode: '([A-Z_]+)'|\brefuse\('([A-Z_]+)'/g)]
    .map((match) => match[1] ?? match[2] ?? match[3]));
  assert.deepEqual([...used].sort(), [...SIGNUP_ERROR_CODES].sort());
});

test('a potluck lists what everyone brings, never who brings it, to anyone who asks', async (t) => {
  for (const as of [null, 'member']) {
    const sql = useDatabase(scriptedSql({
      respond: (statement) => (statement.includes('food_contribution')
        ? [{ foodContribution: 'Pastasalat' }, { foodContribution: 'Kake' }]
        : []),
    }));
    const res = await call(t, handler, { query: { eventId: '7', food: '1' }, as });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { foodContributions: ['Pastasalat', 'Kake'] }, `the same for ${as ?? 'anonymous'}`);
    const lookup = sql.calls.find(({ statement }) => statement.includes('food_contribution'));
    assert.match(lookup.statement, /^SELECT r\.food_contribution as "foodContribution" FROM event_registrations r JOIN events e/);
    assert.match(lookup.statement, /AND e\.potluck = true/, 'only an event that asked for food');
    assert.doesNotMatch(lookup.statement, /\b(name|email|phone|comments|children_names)\b/);
    assert.deepEqual(lookup.values, [7]);
  }
});

// MAINT-005. The signup's own checks, without a request or a database.
test('a signup body is checked before anything is looked up', async () => {
  const { validateSignupBody } = await import('../api/registrations.js');
  const ok = validateSignupBody({ eventId: '7', name: ' Kari ', email: 'KARI@example.test', attendeeCount: 2, language: 'en' });
  assert.deepEqual(
    [ok.values.eventIdNum, ok.values.sanitizedName, ok.values.sanitizedEmail, ok.values.sanitizedAttendeeCount, ok.values.sanitizedLanguage],
    [7, 'Kari', 'kari@example.test', 2, 'en'],
  );
  assert.equal(validateSignupBody({ eventId: '7', name: 'Kari', email: 'kari@example.test', language: 'de' }).values.sanitizedLanguage, 'no');
  for (const [body, code] of [
    [{ name: 'Kari', email: 'kari@example.test' }, 'INVALID_SIGNUP'],
    [{ eventId: '7', email: 'kari@example.test' }, 'INVALID_SIGNUP'],
    [{ eventId: '7', name: 'Kari', email: 'not an address' }, 'INVALID_SIGNUP'],
    [{ eventId: '7.5', name: 'Kari', email: 'kari@example.test' }, 'INVALID_SIGNUP'],
    [{ eventId: '7', name: 'Kari', email: 'kari@example.test', attendeeCount: 0 }, 'ATTENDEES_OUT_OF_RANGE'],
  ]) assert.equal(validateSignupBody(body).error?.code, code, JSON.stringify(body));
});

test('the event decides whether a signup is open and what it must name', async () => {
  const { validateSignupForEvent } = await import('../api/registrations.js');
  const values = (count, language = 'no') => ({ sanitizedAttendeeCount: count, sanitizedLanguage: language });
  const now = '2026-06-01T12:00:00.000Z';
  const check = (event, count, body = {}) => validateSignupForEvent({ type: 'event', potluck: false, ...event }, values(count), body, now);

  assert.equal(check({ no_signup: true }, 1).error.code, 'SIGNUP_CLOSED');
  assert.equal(check({ vigilo_signup: true }, 1).error.code, 'SIGNUP_CLOSED');
  assert.equal(check({ registration_deadline: '2026-05-31T12:00:00.000Z' }, 1).error.code, 'DEADLINE_PASSED');
  assert.deepEqual(check({}, 1).values, { sanitizedChildrenNames: null, sanitizedFoodContribution: null });

  // Everyone besides the registrant is named; on a photo event, every child.
  assert.equal(check({}, 2).error.code, 'ATTENDEE_NAMES_REQUIRED');
  assert.equal(check({}, 2, { childrenNames: '["Ola"]' }).values.sanitizedChildrenNames, '["Ola"]');
  assert.equal(check({ type: 'foto' }, 2, { childrenNames: '["Ola"]' }).error.code, 'CHILD_NAMES_REQUIRED');
  assert.equal(check({ type: 'foto' }, 1, { childrenNames: '["Ola"]' }).values.sanitizedChildrenNames, '["Ola"]');

  // Food is asked for on a potluck only, and dropped elsewhere.
  assert.equal(check({ potluck: true }, 1).error.code, 'FOOD_CONTRIBUTION_REQUIRED');
  assert.equal(check({ potluck: true }, 1, { foodContribution: 'Kake' }).values.sanitizedFoodContribution, 'Kake');
  assert.equal(check({}, 1, { foodContribution: 'Kake' }).values.sanitizedFoodContribution, null);
  assert.equal(validateSignupForEvent({ no_signup: true }, values(1, 'en')).error.message, 'Registration is not available for this event');
});

// TEST-003. The council's view of a signup list, and removing a signup.
test('the council sees the list, everyone else sees only the count', async (t) => {
  const row = { id: 3, eventId: 7, name: 'Kari', email: 'kari@example.test', phone: '90000000', attendeeCount: 2 };
  const database = () => useDatabase(scriptedSql({
    respond: (statement) => (statement.includes('SUM(attendee_count)') ? [{ count: 2 }] : statement.startsWith('SELECT id, event_id') ? [row] : []),
  }));
  database();
  const council = await call(t, handler, { query: { eventId: '7', view: 'council' }, as: 'member' });
  assert.deepEqual([council.statusCode, council.body], [200, [row]]);

  for (const as of [null, 'staff']) {
    database();
    const res = await call(t, handler, { query: { eventId: '7' }, as });
    assert.deepEqual([res.statusCode, res.body], [200, { count: 2 }], String(as));
  }
  // Asked for by name without a council session: a 401, not the count.
  database();
  assert.equal((await call(t, handler, { query: { eventId: '7', view: 'council' } })).statusCode, 401);
});

test('a council member removes a signup, and a missing one is a 404', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: (statement) => (statement.startsWith('WITH deleted AS') ? [{ id: 5, event_id: 7, attendee_count: 2, eventUpdated: true }] : []) }));
  const res = await call(t, handler, { method: 'DELETE', query: { id: '5' }, as: 'member' });
  assert.deepEqual([res.statusCode, res.body], [200, { success: true }]);
  assert.deepEqual(sql.writes().map(({ values }) => values), [[5]], 'one statement removes the row and releases its seats');

  useDatabase(scriptedSql());
  assert.equal((await call(t, handler, { method: 'DELETE', query: { id: '5' }, as: 'member' })).statusCode, 404);
  const refused = useDatabase(scriptedSql());
  assert.equal((await call(t, handler, { method: 'DELETE', query: { id: 'x' }, as: 'member' })).statusCode, 400);
  assert.deepEqual(refused.writes(), []);
});
