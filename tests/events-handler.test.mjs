import assert from 'node:assert/strict';
import test from 'node:test';
import { call, fields, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

const handler = await importHandler('api/events.js');

function row(overrides = {}) {
  return {
    id: 7, title: 'Sommerfest', description: '<p>Grilling</p>', date: '2026-06-12', time: '17:00',
    location: 'Barnehagen', custom_location: 'Uteområdet', max_attendees: 40, current_attendees: 9,
    derived_attendees: 12, registration_deadline: null, type: 'event', status: 'active',
    vigilo_signup: false, no_signup: false, notify_newsletter: null, newsletter_sent_at: null,
    ...overrides,
  };
}

const VALID = { title: 'Sommerfest', description: '<p>Grilling</p>', date: '2026-06-12', time: '17:00', location: 'Barnehagen', type: 'event' };
const write = (method, body, query = {}) => ({ method, body, query, as: 'member' });

test('the public list is mapped to camelCase with the derived attendee count', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: () => [row()] }));
  const res = await call(t, handler, { query: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].customLocation, 'Uteområdet');
  assert.equal(res.body[0].currentAttendees, 12, 'the live sum, never the stored counter');
  assert.equal(res.body[0].notifyNewsletter, false);
  assert.equal('custom_location' in res.body[0], false);
  assert.match(sql.calls[0].statement, /WHERE e\.status IN \('active', 'cancelled'\) AND e\.date >= \?/);
});

// Unbounded, the public list grew with every event ever held.
test('the public list starts at the previous school year unless asked for more', async (t) => {
  const { eventListStart } = await import('../api/events.js');
  assert.equal(eventListStart(undefined, new Date('2026-10-08T12:00:00Z')), '2025-08-01');
  assert.equal(eventListStart(undefined, new Date('2026-07-31T12:00:00Z')), '2024-08-01');
  assert.equal(eventListStart('2019-08-01'), '2019-08-01');

  const sql = useDatabase(scriptedSql({ respond: () => [] }));
  assert.equal((await call(t, handler, { query: { from: '2019-08-01' } })).statusCode, 200);
  assert.equal(sql.calls.at(-1).values.at(-1), '2019-08-01');
  for (const from of ['2019-8-1', 'yesterday', '2019-13-45', ['2019-08-01']]) {
    const refused = useDatabase(scriptedSql());
    assert.equal((await call(t, handler, { query: { from } })).statusCode, 400, String(from));
    assert.deepEqual(refused.calls, []);
  }
});

test('the calendar feed is cacheable iCalendar, a year deep, and skips unrenderable times', async (t) => {
  const sql = useDatabase(scriptedSql({
    respond: (statement) => (statement.includes('FROM events')
      ? [row(), row({ id: 8, title: 'Dugnad', time: '17.00' })]
      : [{ id: 3, title: 'Planleggingsdag', entry_type: 'closed', date: '2026-08-14' }]),
  }));
  const res = await call(t, handler, { query: { format: 'ics', lang: 'en' } });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/calendar; charset=utf-8');
  // Set by the handler: vercel.json header rules match the pre-rewrite path
  // and never see /kalender.ics (see deploy-config).
  assert.match(res.headers['cache-control'], /^public, max-age=\d+, s-maxage=\d+, stale-while-revalidate=\d+$/);
  assert.match(res.body, /^BEGIN:VCALENDAR/);
  assert.match(res.body, /SUMMARY:Sommerfest/);
  assert.match(res.body, /SUMMARY:[^\r]*Planleggingsdag/);
  assert.doesNotMatch(res.body, /Dugnad/, 'a time the feed cannot render is left out');

  const yearAgo = new Date();
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  for (const { values } of sql.calls) assert.equal(values[0], yearAgo.toISOString().slice(0, 10));
});

test('an invalid event is refused with a reason and nothing is written', async (t) => {
  for (const [change, error] of [
    [{ title: '   ' }, /title, date, and time are required/],
    [{ date: '' }, /title, date, and time are required/],
    [{ date: 'neste fredag' }, /YYYY-MM-DD/],
    [{ date: '2026-02-31' }, /real calendar date/],
    [{ date: '2026-6-12' }, /YYYY-MM-DD/],
    [{ date: '12.06.2026' }, /YYYY-MM-DD/],
    [{ time: '17.00' }, /HH:MM/],
    [{ time: '24:00' }, /HH:MM/],
    [{ registrationDeadline: 'next friday' }, /registration deadline/],
    [{ type: 'party' }, /Invalid event type/],
    // Out of range used to be saved as "no limit" rather than refused.
    [{ maxAttendees: 1500 }, /whole number from 0 to 1000/],
    [{ maxAttendees: -5 }, /whole number from 0 to 1000/],
    [{ maxAttendees: 2.5 }, /whole number from 0 to 1000/],
    [{ maxAttendees: 'mange' }, /whole number from 0 to 1000/],
  ]) {
    for (const [method, query] of [['POST', {}], ['PUT', { id: '7' }]]) {
      const sql = useDatabase(scriptedSql());
      const res = await call(t, handler, write(method, { ...VALID, ...change }, query));
      assert.equal(res.statusCode, 400, `${method} ${JSON.stringify(change)}`);
      assert.match(res.body.error, error);
      assert.deepEqual(sql.writes(), []);
    }
  }
});

test('a new event is stored sanitized, with strict flags and a normalized deadline', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: () => [row({ derived_attendees: undefined, current_attendees: 0 })] }));
  const res = await call(t, handler, write('POST', {
    ...VALID,
    title: 'Sommerfest<script>alert(1)</script>',
    description: '<p onclick="x()">Grilling</p><img src=x onerror=alert(1)>',
    maxAttendees: '40',
    registrationDeadline: '2026-06-10T12:00:00+02:00',
    notifyNewsletter: 'true',
  }));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.currentAttendees, 0);

  const [insert] = sql.writes();
  const [title, description, , , , customLocation, maxAttendees, deadline, , vigilo, noSignup, notify] = insert.values;
  assert.doesNotMatch(title, /[<>]/);
  assert.doesNotMatch(description, /onclick|onerror/);
  assert.equal(customLocation, null);
  assert.equal(maxAttendees, 40);
  assert.equal(deadline, '2026-06-10T10:00:00.000Z');
  assert.deepEqual([vigilo, noSignup, notify], [false, false, false], 'only a real true opts in to the newsletter');
});

test('only an event with signup on this site can be a potluck', async (t) => {
  for (const [change, expected] of [
    [{}, false],
    [{ type: 'foreldrefest', potluck: 'true' }, false],
    [{ type: 'foreldrefest', potluck: true }, true],
    [{ type: 'foreldrefest', potluck: true, noSignup: true }, false],
    [{ type: 'foreldrefest', potluck: true, vigiloSignup: true }, false],
  ]) {
    const sql = useDatabase(scriptedSql({ respond: () => [row({ potluck: expected })] }));
    const res = await call(t, handler, write('POST', { ...VALID, ...change }));
    assert.equal(res.statusCode, 201, JSON.stringify(change));
    assert.equal(fields(sql.writes()[0]).potluck, expected, JSON.stringify(change));
    assert.equal(res.body.potluck, expected);
  }

  const sql = useDatabase(scriptedSql({ respond: () => [row({ potluck: true })] }));
  const res = await call(t, handler, write('PUT', { ...VALID, type: 'foreldrefest', potluck: true }, { id: '7' }));
  assert.equal(res.statusCode, 200);
  assert.equal(fields(sql.writes()[0]).potluck, true, 'an update writes the flag too');
});

test('an empty capacity still means no limit; boundary values and a leap day are kept', async (t) => {
  for (const [change, expected] of [
    [{}, { max_attendees: null }],
    [{ maxAttendees: null }, { max_attendees: null }],
    [{ maxAttendees: '' }, { max_attendees: null }],
    [{ maxAttendees: 0 }, { max_attendees: 0 }],
    [{ maxAttendees: '40' }, { max_attendees: 40 }],
    [{ maxAttendees: 1000 }, { max_attendees: 1000 }],
    [{ date: '2028-02-29' }, { date: '2028-02-29' }],
  ]) {
    const sql = useDatabase(scriptedSql({ respond: () => [row()] }));
    const res = await call(t, handler, write('POST', { ...VALID, ...change }));
    assert.equal(res.statusCode, 201, JSON.stringify(change));
    const stored = fields(sql.writes()[0]);
    for (const [column, value] of Object.entries(expected)) assert.equal(stored[column], value, JSON.stringify(change));
  }
});

test('an update needs a numeric id and an existing event', async (t) => {
  const refused = useDatabase(scriptedSql());
  assert.equal((await call(t, handler, write('PUT', VALID, { id: 'abc' }))).statusCode, 400);
  assert.deepEqual(refused.writes(), []);

  useDatabase(scriptedSql());
  assert.equal((await call(t, handler, write('PUT', VALID, { id: '99' }))).statusCode, 404);

  const sql = useDatabase(scriptedSql({ respond: () => [row()] }));
  const res = await call(t, handler, write('PUT', VALID, { id: '7' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.currentAttendees, 12);
  assert.equal(sql.writes()[0].values.at(-1), 7);
});

test('cancelling keeps the event and its registrations, flagged as cancelled', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: () => [row({ status: 'cancelled' })] }));
  const res = await call(t, handler, write('PATCH', {}, { id: '7', action: 'cancel' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'cancelled');
  assert.match(sql.writes()[0].statement, /^UPDATE events SET status = 'cancelled' WHERE id = \?/);

  const unknown = useDatabase(scriptedSql());
  assert.equal((await call(t, handler, write('PATCH', {}, { id: '7', action: 'archive' }))).statusCode, 400);
  assert.deepEqual(unknown.writes(), []);

  useDatabase(scriptedSql());
  assert.equal((await call(t, handler, write('PATCH', {}, { id: '99', action: 'cancel' }))).statusCode, 404);
});

test('deleting reports missing, registered, raced and conflicting events distinctly', async (t) => {
  const state = (s) => () => [s];
  for (const [respond, status, body] of [
    [state({ eventExists: false, hasRegistrations: false, deleted: false }), 404, { error: 'Event not found' }],
    [state({ eventExists: true, hasRegistrations: true, deleted: false }), 400, { hasRegistrations: true }],
    [state({ eventExists: true, hasRegistrations: false, deleted: false }), 409, { error: 'Event could not be deleted' }],
    [state({ eventExists: true, hasRegistrations: false, deleted: true }), 200, { success: true }],
    // A registration committed between the snapshot and the DELETE.
    [() => { throw Object.assign(new Error('fk'), { code: '23503', constraint: 'event_registrations_event_id_fkey' }); },
      400, { hasRegistrations: true }],
    [() => { throw Object.assign(new Error('other'), { code: '23503', constraint: 'something_else' }); }, 500, {}],
  ]) {
    useDatabase(scriptedSql({ respond }));
    const res = await call(t, handler, write('DELETE', {}, { id: '7' }));
    assert.equal(res.statusCode, status);
    for (const [key, value] of Object.entries(body)) assert.equal(res.body[key], value, `${status} ${key}`);
  }
});

// SEC-005. parseInt read these as events 1 and 12 and acted on them.
test('an id that is not a whole number in range is refused before anything is written', async (t) => {
  for (const id of ['1.5', '12abc', '0', '2147483648']) {
    for (const [method, extra] of [['PUT', {}], ['PATCH', { action: 'cancel' }], ['DELETE', {}]]) {
      const sql = useDatabase(scriptedSql({ respond: () => [row()] }));
      const res = await call(t, handler, write(method, VALID, { id, ...extra }));
      assert.equal(res.statusCode, 400, `${method} ?id=${id}`);
      assert.deepEqual(sql.writes(), [], `${method} ?id=${id}`);
    }
  }
});

test('a shared-link preview is cacheable HTML built from the public row', async (t) => {
  const sql = useDatabase(scriptedSql({
    respond: () => [row({ id: 12, title: 'Foreldrefest <i Grendahuset>', date: '2026-11-07', time: '18:00' })],
  }));
  // A rewrite may pass the parameter on twice; the first value is the one read.
  const res = await call(t, handler, { query: { format: 'preview', vis: ['event-12', 'event-12'] } });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  // Short, so an edited entry reaches new previews within minutes.
  assert.equal(res.headers['cache-control'], 'public, max-age=300');
  assert.match(res.body, /<meta property="og:title" content="Foreldrefest &lt;i Grendahuset&gt;">/);
  assert.match(res.body, /<meta property="og:url" content="[^"]*\/kalender\?vis=event-12">/);
  assert.match(res.body, /Uteområdet/, 'the custom location, as on the site');

  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].statement, /FROM events\s+WHERE id = \? AND status IN \('active', 'cancelled'\)/);
  assert.deepEqual(sql.calls[0].values, [12]);
});

test('a preview of a week-long yearly entry reads the yearly table', async (t) => {
  const sql = useDatabase(scriptedSql({
    respond: () => [{
      id: 5, title: 'Brannvernuke', description: null, entry_type: 'week_event', category: null,
      year: 2026, month: 9, week_number: 39, week_number_end: 41, date: null, start_time: null, end_time: null,
    }],
  }));
  const res = await call(t, handler, { query: { format: 'preview', vis: 'entry-5' } });

  assert.match(res.body, /<meta property="og:title" content="Brannvernuke">/);
  assert.match(res.body, /Uke 39–41/);
  assert.match(sql.calls[0].statement, /FROM yearly_calendar_entries\s+WHERE id = \?/);
  assert.deepEqual(sql.calls[0].values, [5]);
});

test('an unknown or malformed shared id previews as the calendar, without guessing', async (t) => {
  const missing = useDatabase(scriptedSql({ respond: () => [] }));
  const gone = await call(t, handler, { query: { format: 'preview', vis: 'event-99' } });
  assert.equal(gone.statusCode, 200);
  assert.match(gone.body, /<meta property="og:title" content="Kalender">/);
  assert.equal(missing.calls.length, 1);

  const sql = useDatabase(scriptedSql());
  const res = await call(t, handler, { query: { format: 'preview', vis: "event-1' OR '1'='1" } });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<meta property="og:url" content="[^"]*\/kalender">/);
  assert.equal(sql.calls.length, 0, 'nothing is looked up for an id the site never hands out');
});
