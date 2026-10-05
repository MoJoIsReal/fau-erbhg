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
import { mockResponse } from './helpers.mjs';

const TOKEN = 'ab'.repeat(32);

function scriptedSql({ lookup = [], cancelled = [], updated = [], rateCount = 1 } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const statement = strings.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ statement, values });
    if (statement.startsWith('INSERT INTO api_rate_limits')) return [{ count: rateCount, retryAfter: 60 }];
    if (statement.includes('WITH deleted AS')) return cancelled;
    if (statement.startsWith('UPDATE event_registrations r SET food_contribution')) return updated;
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
  const res = mockResponse();
  await handleCancel(post('not-a-token'), res, sql, 'cancel');
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test('cancel only accepts POST, so a prefetched GET can never cancel', async () => {
  const { sql, calls } = scriptedSql();
  const res = mockResponse();
  await handleCancel({ ...post(TOKEN), method: 'GET' }, res, sql, 'cancel');
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0);
});

test('cancel is rate limited per IP', async () => {
  const { sql, calls } = scriptedSql({ rateCount: 31 });
  const res = mockResponse();
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
  const res = mockResponse();
  await handleCancel(post(TOKEN), res, sql, 'cancel-lookup');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.eventTitle, 'Sommerfest');
  assert.equal(res.body.cancellable, true);
  assert.equal('email' in res.body, false);
});

test('lookup of an unknown token is a 404', async () => {
  const { sql } = scriptedSql({ lookup: [] });
  const res = mockResponse();
  await handleCancel(post(TOKEN), res, sql, 'cancel-lookup');
  assert.equal(res.statusCode, 404);
});

test('cancel deletes by token, guards on the event date and releases the seats', async () => {
  const { sql, calls } = scriptedSql({ cancelled: [{ id: 7, eventUpdated: true }] });
  const res = mockResponse();
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
  const res = mockResponse();
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

const foodUpdate = (calls) => calls.find(({ statement }) => statement.startsWith('UPDATE event_registrations r SET food_contribution'));

test('the lookup says whether the event is a potluck and what this registration brings', async () => {
  const { sql } = scriptedSql({
    lookup: [{
      name: 'Kari', attendeeCount: 1, foodContribution: 'Pastasalat', eventId: 57, potluck: true,
      eventTitle: 'Foreldrefest', eventDate: '2999-11-07', eventTime: '18:00', location: 'Annet', customLocation: null,
    }],
  });
  const res = mockResponse();
  await handleCancel(post(TOKEN), res, sql, 'cancel-lookup');
  assert.equal(res.body.potluck, true);
  assert.equal(res.body.foodContribution, 'Pastasalat');
  assert.equal(res.body.eventId, 57);
  assert.equal('email' in res.body, false);
});

test('the link can change what a potluck registration brings, sanitized, until the event day is over', async () => {
  const { sql, calls } = scriptedSql({ updated: [{ foodContribution: 'Kake b' }] });
  const res = mockResponse();
  await handleCancel({ ...post(TOKEN), body: { token: TOKEN, foodContribution: ' Kake <b>' } }, res, sql, 'update-food');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { foodContribution: 'Kake b' });

  const update = foodUpdate(calls);
  assert.match(update.statement, /WHERE r\.cancel_token = \? AND e\.id = r\.event_id AND e\.potluck = true AND e\.date >= \?/);
  assert.deepEqual(update.values.slice(0, 2), ['Kake b', TOKEN]);
  assert.match(update.values[2], /^\d{4}-\d{2}-\d{2}$/);
});

test('an empty food answer is refused like at signup, before anything is written', async () => {
  for (const foodContribution of [undefined, '', '   ', 42]) {
    const { sql, calls } = scriptedSql();
    const res = mockResponse();
    await handleCancel({ ...post(TOKEN), body: { token: TOKEN, foodContribution } }, res, sql, 'update-food');
    assert.equal(res.statusCode, 400, JSON.stringify(foodContribution));
    assert.equal(res.body.code, 'FOOD_CONTRIBUTION_REQUIRED');
    assert.equal(foodUpdate(calls), undefined);
  }
});

test('changing the food needs a valid link, a potluck and an event still ahead', async () => {
  let { sql, calls } = scriptedSql();
  let res = mockResponse();
  await handleCancel({ ...post('not-a-token'), body: { token: 'nope', foodContribution: 'Kake' } }, res, sql, 'update-food');
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);

  ({ sql } = scriptedSql({ updated: [] }));
  res = mockResponse();
  await handleCancel({ ...post(TOKEN), body: { token: TOKEN, foodContribution: 'Kake' } }, res, sql, 'update-food');
  assert.equal(res.statusCode, 404, 'unknown token, not a potluck, or the event is over');

  ({ sql, calls } = scriptedSql());
  res = mockResponse();
  await handleCancel({ ...post(TOKEN), method: 'GET', body: { token: TOKEN, foodContribution: 'Kake' } }, res, sql, 'update-food');
  assert.equal(res.statusCode, 405);
  assert.equal(calls.length, 0);
});

test('a potluck email says the same link changes what you bring', () => {
  assert.match(cancellationText({ language: 'no', cancelToken: TOKEN, potluck: true }), /endre hva du tar med.*\/avmelding\?token=/);
  assert.match(cancellationText({ language: 'en', cancelToken: TOKEN, potluck: true }), /change what you bring/);
  assert.doesNotMatch(cancellationText({ language: 'no', cancelToken: TOKEN }), /tar med/);
  const { text } = registrationReminderEmail({
    name: 'Kari', language: 'no', eventTitle: 'Foreldrefest', eventDate: '2026-11-07', eventTime: '18:00',
    location: 'Annet', attendeeCount: 1, cancelToken: TOKEN, potluck: true,
  });
  assert.match(text, /endre hva du tar med/);
});
