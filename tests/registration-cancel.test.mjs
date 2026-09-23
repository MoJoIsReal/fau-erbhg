import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  cancellationText,
  isCancelToken,
  isCancellationOpen,
  osloToday,
  registrationCancelUrl,
} from '../api/_shared/registration-cancel.js';
import { handleCancel } from '../api/registrations.js';
import { registrationReminderEmail } from '../api/cron/event-reminders.js';

const TOKEN = 'ab'.repeat(32);

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function scriptedSql({ lookup = [], cancelled = [], rateCount = 1 } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const statement = strings.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ statement, values });
    if (statement.startsWith('INSERT INTO api_rate_limits')) return [{ count: rateCount, retryAfter: 60 }];
    if (statement.includes('WITH deleted AS')) return cancelled;
    if (statement.includes('WHERE r.cancel_token = ?')) return lookup;
    throw new Error(`unexpected statement: ${statement}`);
  };
  return { sql, calls };
}

function post(token) {
  return { method: 'POST', headers: { 'x-real-ip': '203.0.113.9' }, body: { token } };
}

test('cancel tokens are exactly the 64-hex shape the database default produces', () => {
  assert.equal(isCancelToken(TOKEN), true);
  assert.equal(isCancelToken('ab'.repeat(31)), false);
  assert.equal(isCancelToken(`${'ab'.repeat(31)}ZZ`), false);
  assert.equal(isCancelToken(undefined), false);
  // Mirrors replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '').
  const generated = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
  assert.equal(isCancelToken(generated), true);
});

test('the cancel link points at the /avmelding page on the public site', () => {
  const previous = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'https://example.test/';
  try {
    assert.equal(registrationCancelUrl(TOKEN), `https://example.test/avmelding?token=${TOKEN}`);
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous;
  }
});

test('cancellation stays open through the event day in Oslo, then closes', () => {
  // 23:30 UTC on 9 Sept is already 10 Sept in Oslo (UTC+2).
  const now = new Date('2026-09-09T23:30:00Z');
  assert.equal(osloToday(now), '2026-09-10');
  assert.equal(isCancellationOpen('2026-09-10', now), true);
  assert.equal(isCancellationOpen('2026-09-11', now), true);
  assert.equal(isCancellationOpen('2026-09-09', now), false);
  assert.equal(isCancellationOpen('', now), false);
  assert.equal(isCancellationOpen(null, now), false);
});

test('email text carries the link, and falls back to replying without a token', () => {
  assert.match(cancellationText({ language: 'no', cancelToken: TOKEN }), new RegExp(`Meld deg av her: .*/avmelding\\?token=${TOKEN}`));
  assert.match(cancellationText({ language: 'en', cancelToken: TOKEN }), /Cancel your registration here: /);
  assert.match(cancellationText({ language: 'no', cancelToken: null }), /svare på denne e-posten/);
  assert.doesNotMatch(cancellationText({ language: 'en', cancelToken: 'nope' }), /avmelding/);
});

test('the registration reminder includes the cancel link', () => {
  const { text } = registrationReminderEmail({
    name: 'Kari',
    language: 'no',
    eventTitle: 'Sommerfest',
    eventDate: '2026-09-10',
    eventTime: '17:00',
    location: 'Barnehagen',
    attendeeCount: 2,
    cancelToken: TOKEN,
  });
  assert.match(text, new RegExp(`/avmelding\\?token=${TOKEN}`));
});

test('cancel rejects a malformed token before touching the database', async () => {
  const { sql, calls } = scriptedSql();
  const res = response();
  await handleCancel(post('not-a-token'), res, sql, 'cancel');
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test('cancel only accepts POST, so a prefetched GET can never cancel', async () => {
  const { sql, calls } = scriptedSql();
  const res = response();
  await handleCancel({ ...post(TOKEN), method: 'GET' }, res, sql, 'cancel');
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0);
});

test('cancel is rate limited per IP', async () => {
  const { sql, calls } = scriptedSql({ rateCount: 31 });
  const res = response();
  await handleCancel(post(TOKEN), res, sql, 'cancel');
  assert.equal(res.statusCode, 429);
  assert.equal(calls.length, 1);
});

test('lookup returns the event summary and whether it can still be cancelled', async () => {
  const { sql } = scriptedSql({
    lookup: [{
      name: 'Kari', attendeeCount: 2, eventTitle: 'Sommerfest', eventDate: '2999-06-01',
      eventTime: '17:00', location: 'Barnehagen', customLocation: null,
    }],
  });
  const res = response();
  await handleCancel(post(TOKEN), res, sql, 'cancel-lookup');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.eventTitle, 'Sommerfest');
  assert.equal(res.body.cancellable, true);
  assert.equal('email' in res.body, false);
});

test('lookup of an unknown token is a 404', async () => {
  const { sql } = scriptedSql({ lookup: [] });
  const res = response();
  await handleCancel(post(TOKEN), res, sql, 'cancel-lookup');
  assert.equal(res.statusCode, 404);
});

test('cancel deletes by token, guards on the event date and releases the seats', async () => {
  const { sql, calls } = scriptedSql({ cancelled: [{ id: 7, eventUpdated: true }] });
  const res = response();
  await handleCancel(post(TOKEN), res, sql, 'cancel');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });

  const deletion = calls.find(({ statement }) => statement.includes('WITH deleted AS'));
  assert.match(deletion.statement, /DELETE FROM event_registrations r USING events e WHERE r\.cancel_token = \?/);
  assert.match(deletion.statement, /e\.date >= \?/);
  assert.match(deletion.statement, /SET current_attendees = GREATEST\(0,/);
  // The same statement records who cancelled, for the council's list.
  assert.match(deletion.statement, /recorded AS \( INSERT INTO event_registration_cancellations/);
  assert.match(deletion.statement, /FROM deleted d/);
  assert.equal(deletion.values[0], TOKEN);
  assert.match(deletion.values[1], /^\d{4}-\d{2}-\d{2}$/);
});

test('cancelling twice, or after the event, is a 404', async () => {
  const { sql } = scriptedSql({ cancelled: [] });
  const res = response();
  await handleCancel(post(TOKEN), res, sql, 'cancel');
  assert.equal(res.statusCode, 404);
});

test('the council list never selects the cancel token', () => {
  const source = readFileSync(new URL('../api/registrations.js', import.meta.url), 'utf8');
  const councilList = source.slice(
    source.indexOf('if (isCouncilMember)'),
    source.indexOf('Public access - return aggregate only'),
  );
  assert.doesNotMatch(councilList, /cancel_token/);
  assert.match(source, /const \{ cancel_token: _cancelToken, \.\.\.publicRegistration \}/);
});

test('migration generates, backfills and uniquely indexes the token', () => {
  const migration = readFileSync(
    new URL('../migrations/0015_registration_cancel_token.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /SET DEFAULT replace\(gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text, '-', ''\)/);
  assert.match(migration, /WHERE cancel_token IS NULL/);
  assert.match(migration, /SET NOT NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_cancel_token_idx/);
});

test('only the self-service cancel records a cancellation, not the council delete', () => {
  const source = readFileSync(new URL('../api/registrations.js', import.meta.url), 'utf8');
  const councilDelete = source.slice(source.indexOf("if (req.method === 'DELETE')"));
  assert.doesNotMatch(councilDelete.slice(0, councilDelete.indexOf('Method not allowed')), /event_registration_cancellations/);
});

test('the cancellation list is council-only and hides people who signed up again', () => {
  const source = readFileSync(new URL('../api/registrations.js', import.meta.url), 'utf8');
  const list = source.slice(source.indexOf("req.query.cancelled === '1'"), source.indexOf('if (isCouncilMember) {'));
  assert.match(list, /requireRole\(req, res, COUNCIL_ROLES, sql\)/);
  assert.match(list, /NOT EXISTS[\s\S]*lower\(r\.email\) = lower\(c\.email\)/);
});

test('cancellation migration cascades with the event', () => {
  const migration = readFileSync(
    new URL('../migrations/0016_registration_cancellations.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS event_registration_cancellations/);
  assert.match(migration, /REFERENCES events\(id\) ON DELETE CASCADE/);
});
