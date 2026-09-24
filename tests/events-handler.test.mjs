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
  assert.match(sql.calls[0].statement, /WHERE e\.status IN \('active', 'cancelled'\)/);
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
