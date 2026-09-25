import assert from 'node:assert/strict';
import test from 'node:test';
import { call, fields, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

const handler = await importHandler('api/yearly-calendar.js');
const SCHOOL_YEAR = 2026;

const DAY_EVENT = {
  entryType: 'day_event', title: 'Sommerfest', schoolYear: SCHOOL_YEAR, year: 2027, month: 6, date: '2027-06-04',
};
const write = (method, body, query = {}) => ({ method, body, query, as: 'staff' });
const stored = (overrides = {}) => ({ id: 5, school_year: SCHOOL_YEAR, year: 2027, month: 6, entry_type: 'day_event',
  title: 'Sommerfest', category: null, show_on_homepage: null, ...overrides });

test('reading a school year needs a numeric year and returns mapped entries', async (t) => {
  const refused = useDatabase(scriptedSql());
  assert.equal((await call(t, handler, { query: { schoolYear: 'neste' } })).statusCode, 400);
  assert.deepEqual(refused.calls, []);

  const sql = useDatabase(scriptedSql({ respond: () => [stored({ week_number: 23 })] }));
  const res = await call(t, handler, { query: { schoolYear: String(SCHOOL_YEAR) } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].weekNumber, 23);
  assert.equal(res.body[0].category, null, 'null means "follow the entry type"');
  assert.equal(res.body[0].showOnHomepage, false);
  assert.deepEqual(sql.calls[0].values, [SCHOOL_YEAR]);
});

// school_year, year and month are NOT NULL. An update used to check only the
// type and title, so a PUT without its placement reached the database and
// answered 500 instead of saying what was missing.
test('an entry without its type, title or placement is refused on create and update alike', async (t) => {
  for (const change of [
    { entryType: 'party' }, { title: '  ' },
    { schoolYear: undefined }, { schoolYear: 1999 }, { year: undefined }, { month: undefined }, { month: 13 },
  ]) {
    for (const [method, query] of [['POST', {}], ['PUT', { id: '5' }]]) {
      const sql = useDatabase(scriptedSql());
      const res = await call(t, handler, write(method, { ...DAY_EVENT, ...change }, query));
      const [[field, value]] = Object.entries(change);
      assert.equal(res.statusCode, 400, `${method} with ${field}=${value}`);
      assert.match(res.body.error, /entryType, title, schoolYear, year and month are required/);
      assert.deepEqual(sql.writes(), []);
    }
  }
});

test('a day event is stored with normalized colour and times, strict flags and its author', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: () => [stored()] }));
  const res = await call(t, handler, write('POST', {
    ...DAY_EVENT,
    title: 'Sommer<fest>',
    color: '#3B82F6',
    category: 'arrangement',
    startTime: '9:05',
    endTime: '08:00',
    showOnHomepage: true,
    showForParents: 'true',
    notifyNewsletter: true,
  }));
  assert.equal(res.statusCode, 201);
  const row = fields(sql.writes()[0]);
  assert.equal(row.title, 'Sommerfest');
  assert.equal(row.color, '#3b82f6');
  assert.equal(row.category, 'arrangement');
  assert.equal(row.start_time, '09:05');
  assert.equal(row.end_time, null, 'an end before the start is dropped');
  assert.deepEqual([row.show_on_homepage, row.show_for_parents, row.notify_newsletter], [true, false, true]);
  assert.equal(row.created_by, 'Staff');
});

// Only a day event carries a clock time or homepage flags, and only dated
// entries go in the newsletter, so a stale value cannot survive a type change.
test('fields another entry type cannot use are cleared rather than stored', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: () => [stored()] }));
  await call(t, handler, write('POST', {
    entryType: 'week_event', title: 'Brannvernuke', schoolYear: SCHOOL_YEAR, year: 2026, month: 9,
    weekNumber: 38, weekNumberEnd: 37, category: 'not-a-category', color: 'grey',
    startTime: '10:00', showOnHomepage: true, showForParents: true, notifyNewsletter: true,
  }));
  const row = fields(sql.writes()[0]);
  assert.equal(row.week_number, 38);
  assert.equal(row.week_number_end, null, 'an end week before the start makes a single-week entry');
  assert.deepEqual(
    [row.category, row.color, row.start_time, row.show_on_homepage, row.show_for_parents, row.notify_newsletter],
    [null, null, null, false, false, false],
  );
});

test('update and delete need a numeric id and an existing entry', async (t) => {
  for (const [method, body] of [['PUT', DAY_EVENT], ['DELETE', {}]]) {
    const refused = useDatabase(scriptedSql());
    assert.equal((await call(t, handler, write(method, body, { id: 'x' }))).statusCode, 400, method);
    assert.deepEqual(refused.writes(), []);

    useDatabase(scriptedSql());
    assert.equal((await call(t, handler, write(method, body, { id: '99' }))).statusCode, 404, method);
  }

  const sql = useDatabase(scriptedSql({ respond: () => [stored({ title: 'Sommerfest 2' })] }));
  const res = await call(t, handler, write('PUT', { ...DAY_EVENT, title: 'Sommerfest 2' }, { id: '5' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.title, 'Sommerfest 2');
  assert.equal(fields(sql.writes()[0]).id, 5);
});

// --- Excel import ----------------------------------------------------------

const EXISTING = [
  stored({ id: 10, year: 2026, month: 12, entry_type: 'closed', date: '2026-12-24', title: 'Julaften',
    description: null, color: null, week_number: null, week_number_end: null, show_on_homepage: false,
    show_for_parents: false }),
];

function sheet(title, date, extra = {}) {
  const [year, month] = date.split('-').map(Number);
  return { entry_type: 'closed', tittel: title, dato: date, 'år': year, 'måned': month, ...extra };
}

// Answers the saved school year, and the import's one write the way
// PostgreSQL would: each update aimed at a saved entry comes back updated
// (`missing` ids have been deleted since), each create comes back created.
function importDatabase({ fail = false, missing = [] } = {}) {
  return useDatabase(scriptedSql({
    respond(statement, values) {
      if (statement.startsWith('SELECT')) return EXISTING;
      if (!statement.startsWith('WITH input AS')) return [];
      if (fail) throw new Error('database unavailable');
      return JSON.parse(values[0])
        .filter((write) => !missing.includes(write.id))
        .map((write, index) => ({
          outcome: write.action === 'update' ? 'updated' : 'created',
          entry: stored({ ...write, id: write.action === 'update' ? write.id : 20 + index }),
        }));
    },
  }));
}

const importWrites = (sql) => sql.writes().filter(({ statement }) => statement.startsWith('WITH input AS'));

test('the import endpoints refuse a malformed batch before reading anything', async (t) => {
  for (const [action, body] of [
    ['preview-import', { rows: [] }],
    ['preview-import', { schoolYear: SCHOOL_YEAR, rows: 'all of them' }],
    ['preview-import', { schoolYear: SCHOOL_YEAR, rows: Array(501).fill({}) }],
    ['commit-import', { decisions: [] }],
    ['commit-import', { schoolYear: SCHOOL_YEAR, decisions: {} }],
    ['commit-import', { schoolYear: SCHOOL_YEAR, decisions: Array(501).fill({}) }],
  ]) {
    const sql = useDatabase(scriptedSql());
    assert.equal((await call(t, handler, write('POST', body, { action }))).statusCode, 400, action);
    assert.deepEqual(sql.calls.filter(({ statement }) => statement.includes('yearly_calendar_entries')), []);
  }
});

test('the preview compares sanitized sheet rows with the saved school year', async (t) => {
  const sql = importDatabase();
  const res = await call(t, handler, write('POST', {
    schoolYear: SCHOOL_YEAR,
    rows: [sheet('Julaften', '2026-12-23'), sheet('<b>Planleggingsdag</b>', '2027-01-04')],
  }, { action: 'preview-import' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.rows.map(({ status }) => status), ['changed', 'new']);
  assert.equal(res.body.rows[0].existing.id, 10);
  assert.doesNotMatch(JSON.stringify(res.body.rows[1]), /[<>]/);
  assert.deepEqual(res.body.rows.map(({ rowNumber }) => rowNumber), [2, 3], 'rows default to their sheet line');
  assert.deepEqual(sql.writes(), []);
});

test('a commit applies each decision the server re-derives, and reports the rest per row', async (t) => {
  const sql = importDatabase();
  const res = await call(t, handler, write('POST', {
    schoolYear: SCHOOL_YEAR,
    decisions: [
      { rowNumber: 2, status: 'changed', action: 'update', existingId: 10, row: sheet('Julaften', '2026-12-23') },
      { rowNumber: 3, status: 'new', action: 'create', row: sheet('Planleggingsdag', '2027-01-04') },
      { rowNumber: 4, status: 'new', action: 'ignore' },
      // The client calls it an update, but the server sees a new row.
      { rowNumber: 5, status: 'changed', action: 'update', existingId: 10, row: sheet('Helt ny', '2027-02-01') },
      // An update aimed at an entry the preview did not match.
      { rowNumber: 6, status: 'changed', action: 'update', existingId: 11, row: sheet('Julaften', '2026-12-23') },
      { rowNumber: 7, status: 'new', action: 'create', row: sheet('Neste år', '2030-01-02') },
      { rowNumber: 8, status: 'toString', action: 'create', row: sheet('Rar', '2027-01-05') },
      // Claimed new, but already saved unchanged: creating it would duplicate it.
      { rowNumber: 10, status: 'new', action: 'create', row: sheet('Julaften', '2026-12-24') },
    ],
  }, { action: 'commit-import' }));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.updated.map(({ id }) => id), [10]);
  assert.equal(res.body.created.length, 1);
  assert.deepEqual(res.body.ignored, [{ rowNumber: 4 }]);
  assert.deepEqual(res.body.errors.map(({ rowNumber }) => rowNumber), [5, 6, 7, 8, 10]);
  assert.match(res.body.errors[4].errors[0], /not allowed for status "unchanged"/);

  const [statement] = importWrites(sql);
  assert.equal(sql.writes().length, 1, 'every write goes in one statement');
  assert.match(statement.statement, /WHERE e\.id = u\.id AND e\.school_year = \?/);
  assert.ok(statement.values.includes(SCHOOL_YEAR), 'updates are scoped to the school year they were previewed in');
  assert.ok(statement.values.includes('Staff'), 'created entries record their author');
  assert.match(statement.statement, /show_on_homepage, show_for_parents, false, \?/, 'an imported entry never opts in to the newsletter');
  const [update, create] = JSON.parse(statement.values[0]);
  assert.deepEqual([update.action, update.id, update.row_number, update.date], ['update', 10, 2, '2026-12-23']);
  // The preview only diffs these fields, so the import must not touch others.
  for (const column of ['category', 'weekday_start', 'weekday_end', 'start_time', 'end_time', 'notify_newsletter']) {
    assert.equal(column in update, false, `the import must leave ${column} alone`);
    assert.doesNotMatch(statement.statement.split('), created AS')[0], new RegExp(`\\b${column} =`), `the UPDATE must not set ${column}`);
  }
  assert.deepEqual([create.action, create.title], ['create', 'Planleggingsdag']);
});

// PERF-003. One UPDATE or INSERT per row meant up to 500 round trips inside a
// 30-second function, each committed on its own: a timeout or a failing row
// left part of the school year imported.
test('a full import is one read and one write, and a failed write fails the whole import', async (t) => {
  const decisions = Array.from({ length: 500 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const month = String((Math.floor(index / 28) % 7) + 1).padStart(2, '0');
    return { rowNumber: index + 2, status: 'new', action: 'create', row: sheet(`Rad ${index}`, `2027-${month}-${day}`) };
  });
  const sql = importDatabase();
  const res = await call(t, handler, write('POST', { schoolYear: SCHOOL_YEAR, decisions }, { action: 'commit-import' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created.length, 500);
  assert.ok(sql.calls.length <= 3, `${sql.calls.length} statements: identity lookup, school year, one write`);

  const failing = importDatabase({ fail: true });
  const failed = await call(t, handler, write('POST', { schoolYear: SCHOOL_YEAR, decisions }, { action: 'commit-import' }));
  assert.equal(failed.statusCode, 500);
  assert.equal(importWrites(failing).length, 1, 'the one statement either writes every row or none');
});

test('an entry deleted since the preview is reported for its row', async (t) => {
  importDatabase({ missing: [10] });
  const res = await call(t, handler, write('POST', {
    schoolYear: SCHOOL_YEAR,
    decisions: [{ rowNumber: 2, status: 'changed', action: 'update', existingId: 10, row: sheet('Julaften', '2026-12-23') }],
  }, { action: 'commit-import' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.updated, []);
  assert.deepEqual(res.body.errors, [{ rowNumber: 2, errors: ['Existing entry was not found for the selected school year.'] }]);
});
