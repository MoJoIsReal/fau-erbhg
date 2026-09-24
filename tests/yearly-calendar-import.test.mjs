import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImportPreview,
  diffYearlyCalendarEntry,
  normalizeYearlyCalendarTitle,
  supportsYearlyCalendarNewsletter,
  validateImportDecision,
  validateYearlyCalendarImportRow,
} from '../shared/yearly-calendar-utils.js';

// schoolYear 2026 means barnehageåret 2026/2027, so autumn dates are 2026 and
// spring dates are 2027.
const SCHOOL_YEAR = 2026;

function sheetRow(rowNumber, title, date) {
  const [year, month] = date.split('-');
  return {
    rowNumber,
    tittel: title,
    entry_type: 'closed',
    dato: date,
    'år': Number(year),
    'måned': Number(month),
  };
}

function existing(id, title, date) {
  const [year, month] = date.split('-');
  return {
    id,
    schoolYear: SCHOOL_YEAR,
    year: Number(year),
    month: Number(month),
    entryType: 'closed',
    date,
    title,
    description: null,
    color: null,
    weekNumber: null,
    weekNumberEnd: null,
    showOnHomepage: false,
    showForParents: false,
  };
}

const preview = (existingEntries, rows) =>
  buildImportPreview({ schoolYear: SCHOOL_YEAR, existingEntries, rows });

// Matching on the normalised title alone bound every same-titled sheet row to
// the same database row. A year with three "Planleggingsdag" entries offered
// two of them as an update of the first, each with a believable diff; approving
// the preview overwrote that one entry twice and never created the other two.
test('several same-titled rows do not all bind to one existing entry', () => {
  const result = preview(
    [existing(101, 'Planleggingsdag', '2026-08-14')],
    [
      sheetRow(2, 'Planleggingsdag', '2026-08-14'),
      sheetRow(3, 'Planleggingsdag', '2027-01-02'),
      sheetRow(4, 'Planleggingsdag', '2027-05-15'),
    ],
  );

  assert.deepEqual(result.counts, { new: 2, unchanged: 1, changed: 0, invalid: 0, ambiguous: 0 });
  assert.equal(
    result.rows.filter((row) => row.existing?.id === 101).length,
    1,
    'exactly one row may claim entry 101',
  );
  assert.equal(result.rows[0].status, 'unchanged', 'the row on the same date is that entry');
  assert.equal(result.rows[1].status, 'new');
  assert.equal(result.rows[2].status, 'new');
});

// The opposite failure mode: keying identity on the date would stop recognising
// an entry whose date was corrected in the sheet, which is an edit.
test('one entry matched by one row pairs even when the date changed', () => {
  const result = preview(
    [existing(200, 'Sommerfest', '2027-06-02')],
    [sheetRow(2, 'Sommerfest', '2027-06-04')],
  );

  assert.equal(result.rows[0].status, 'changed');
  assert.equal(result.rows[0].existing.id, 200);
  assert.deepEqual(result.rows[0].changes.map((change) => change.field), ['date']);
});

// Two rows in one sheet describing the same entry both created on the first
// import, and from the second import on were permanently ambiguous — so the
// sheet could never update them again, only add more duplicates.
test('two sheet rows describing the same entry are both held back', () => {
  const result = preview([], [sheetRow(2, 'Dugnad', '2026-09-01'), sheetRow(3, 'Dugnad', '2026-09-01')]);

  assert.equal(result.counts.ambiguous, 2);
  assert.equal(result.counts.new, 0, 'neither row may silently create');
  for (const row of result.rows) assert.equal(row.defaultAction, 'ignore');
});

// With two same-titled entries and no positional match we cannot tell whether
// the author moved one of them or added a third, so say so rather than guess.
test('an unmatched row among several same-titled entries is ambiguous', () => {
  const result = preview(
    [existing(1, 'Dugnad', '2026-09-05'), existing(2, 'Dugnad', '2026-10-05')],
    [sheetRow(2, 'Dugnad', '2026-11-05')],
  );

  assert.equal(result.rows[0].status, 'ambiguous');
});

test('a title that exists nowhere is new', () => {
  const result = preview([existing(1, 'Dugnad', '2026-09-05')], [sheetRow(2, 'Karneval', '2027-02-10')]);
  assert.equal(result.rows[0].status, 'new');
  assert.equal(result.rows[0].defaultAction, 'create');
});

test('re-importing an unmodified sheet changes nothing', () => {
  const entries = [existing(101, 'Planleggingsdag', '2026-08-14'), existing(102, 'Juleferie', '2026-12-24')];
  const result = preview(entries, [
    sheetRow(2, 'Planleggingsdag', '2026-08-14'),
    sheetRow(3, 'Juleferie', '2026-12-24'),
  ]);

  assert.deepEqual(result.counts, { new: 0, unchanged: 2, changed: 0, invalid: 0, ambiguous: 0 });
});

// MAINT-006. `DECISION_ACTIONS[status]` reached Function.prototype for a
// prototype-named status, and `.includes` is not a function there, so a request
// carrying {"status":"toString"} threw a TypeError out of per-decision
// validation and aborted the entire import batch with a 500.
test('a prototype-named status is rejected, not thrown on', () => {
  for (const status of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
    const result = validateImportDecision({ status, action: 'ignore' });
    assert.equal(result.ok, false, `status "${status}" must not be accepted`);
    assert.match(result.error, /is not allowed for status/);
  }
});

test('each preview status accepts exactly the actions it allows', () => {
  const allowed = {
    new: ['create', 'ignore'],
    unchanged: ['ignore'],
    changed: ['update', 'create', 'ignore'],
    ambiguous: ['create', 'ignore'],
    invalid: ['ignore'],
  };
  for (const [status, actions] of Object.entries(allowed)) {
    for (const action of ['create', 'update', 'ignore']) {
      const result = validateImportDecision({ status, action });
      assert.equal(result.ok, actions.includes(action), `${status} → ${action}`);
      if (!result.ok) assert.match(result.error, /not allowed/);
    }
  }
});

test('a prototype-named action is rejected too', () => {
  const result = validateImportDecision({ status: 'new', action: 'toString' });
  assert.equal(result.ok, false);
});

// Row validation, diffing and the preview on sheet-shaped input.

const YEAR_COLUMN = '\u00e5r';
const MONTH_COLUMN = 'm\u00e5ned';
const HOMEPAGE_COLUMN = 'vis_p\u00e5_forside';

function validDayRow(overrides = {}) {
  return {
    entry_type: 'day_event',
    tittel: 'Sommerfest',
    dato: '2028-06-04',
    [YEAR_COLUMN]: 2028,
    [MONTH_COLUMN]: 6,
    beskrivelse: 'Sommerfest for alle',
    farge: 'green',
    [HOMEPAGE_COLUMN]: true,
    for_foreldre: false,
    ...overrides,
  };
}

function validWeekRow(overrides = {}) {
  return {
    entry_type: 'week_event',
    tittel: 'Brannvernuke',
    [YEAR_COLUMN]: 2027,
    [MONTH_COLUMN]: 9,
    uke_fra: 38,
    farge: 'orange',
    ...overrides,
  };
}

function assertInvalidContains(result, expected) {
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((message) => message.includes(expected)),
    `Expected one error to include "${expected}", got ${JSON.stringify(result.errors)}`,
  );
  assert.ok(
    result.errors.every((message) => message.includes('Rad 12:')),
    `Expected all errors to include row number, got ${JSON.stringify(result.errors)}`,
  );
}

test('a valid Norwegian-headed day row becomes a full payload', () => {
  const result = validateYearlyCalendarImportRow({
    rowNumber: 2,
    schoolYear: 2027,
    row: validDayRow(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, {
    schoolYear: 2027,
    year: 2028,
    month: 6,
    entryType: 'day_event',
    title: 'Sommerfest',
    description: 'Sommerfest for alle',
    color: 'green',
    weekNumber: null,
    weekNumberEnd: null,
    date: '2028-06-04',
    showOnHomepage: true,
    showForParents: false,
  });
});

test('camelCase headers import too, and notes never show on the homepage', () => {
  const result = validateYearlyCalendarImportRow({
    rowNumber: 3,
    schoolYear: 2027,
    row: {
      entryType: 'note',
      title: 'Husk regnt\u00f8y',
      year: 2027,
      month: 10,
      weekNumber: 41,
      weekNumberEnd: 42,
      description: 'Ta med ekstra skift',
      color: 'blue',
      showOnHomepage: true,
      showForParents: true,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.entryType, 'note');
  assert.equal(result.payload.weekNumber, 41);
  assert.equal(result.payload.weekNumberEnd, 42);
  assert.equal(result.payload.showOnHomepage, false);
  assert.equal(result.payload.showForParents, false);
});

test('invalid rows name the field and the sheet row they came from', () => {
  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ tittel: '   ' }),
    }),
    'Mangler tittel',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'event' }),
    }),
    'Ugyldig entry_type "event"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'DAY_EVENT' }),
    }),
    'Ugyldig entry_type "DAY_EVENT"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ farge: 'grey' }),
    }),
    'Fargen "grey"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ farge: 'Green' }),
    }),
    'Fargen "Green"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ dato: '2029-02-01', [YEAR_COLUMN]: 2029, [MONTH_COLUMN]: 2 }),
    }),
    'utenfor barnehage\u00e5ret 2027/2028',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ dato: '2028-02-31', [YEAR_COLUMN]: 2028, [MONTH_COLUMN]: 2 }),
    }),
    'YYYY-MM-DD',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'closed', dato: '' }),
    }),
    'closed krever dato',
  );

  const emptyColor = validateYearlyCalendarImportRow({
    rowNumber: 16,
    schoolYear: 2027,
    row: validDayRow({ farge: '   ' }),
  });
  assert.equal(emptyColor.ok, true);
  assert.equal(emptyColor.payload.color, null);

  const hexColor = validateYearlyCalendarImportRow({
    rowNumber: 17,
    schoolYear: 2027,
    row: validDayRow({ farge: '#3B82F6' }),
  });
  assert.equal(hexColor.ok, true);
  assert.equal(hexColor.payload.color, '#3b82f6');

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ tittel: 'T'.repeat(201) }),
    }),
    'Tittel',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ beskrivelse: 'B'.repeat(1001) }),
    }),
    'Beskrivelse',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ [HOMEPAGE_COLUMN]: 'sure' }),
    }),
    'vis_p\u00e5_forside',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ for_foreldre: 'maybe' }),
    }),
    'for_foreldre',
  );
});

test('week-based entry types require a week in range; food ignores an end week', () => {
  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validWeekRow({ uke_til: 38 }),
    }),
    'uke_til',
  );

  for (const entryType of ['week_event', 'food', 'note']) {
    assertInvalidContains(
      validateYearlyCalendarImportRow({
        rowNumber: 12,
        schoolYear: 2027,
        row: validWeekRow({ entry_type: entryType, uke_fra: '' }),
      }),
      `${entryType} krever uke_fra`,
    );

    assertInvalidContains(
      validateYearlyCalendarImportRow({
        rowNumber: 12,
        schoolYear: 2027,
        row: validWeekRow({ entry_type: entryType, uke_fra: 54 }),
      }),
      `${entryType} krever uke_fra`,
    );
  }

  const food = validateYearlyCalendarImportRow({
    rowNumber: 13,
    schoolYear: 2027,
    row: validWeekRow({ entry_type: 'food', tittel: 'Fiskesuppe', uke_til: 1 }),
  });
  assert.equal(food.ok, true);
  assert.equal(food.payload.weekNumber, 38);
  assert.equal(food.payload.weekNumberEnd, null);
});

test('homepage and parent flags parse yes-words and never apply to closures', () => {
  const dayEvent = validateYearlyCalendarImportRow({
    rowNumber: 14,
    schoolYear: 2027,
    row: validDayRow({ [HOMEPAGE_COLUMN]: 'true', for_foreldre: 'ja' }),
  });
  assert.equal(dayEvent.ok, true);
  assert.equal(dayEvent.payload.showOnHomepage, true);
  assert.equal(dayEvent.payload.showForParents, true);

  const closed = validateYearlyCalendarImportRow({
    rowNumber: 15,
    schoolYear: 2027,
    row: validDayRow({ entry_type: 'closed', [HOMEPAGE_COLUMN]: true, for_foreldre: true }),
  });
  assert.equal(closed.ok, true);
  assert.equal(closed.payload.showOnHomepage, false);
  assert.equal(closed.payload.showForParents, false);
});

test('the diff lists exactly the fields that changed, with their sheet labels', () => {
  const changes = diffYearlyCalendarEntry(
    {
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-02',
      title: 'Sommerfest',
      description: null,
      color: 'green',
      showOnHomepage: true,
      showForParents: false,
    },
    {
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-04',
      title: 'Sommerfest',
      description: null,
      color: 'blue',
      showOnHomepage: true,
      showForParents: false,
    },
  );

  assert.deepEqual(changes, [
    { field: 'date', label: 'dato', oldValue: '2028-06-02', newValue: '2028-06-04' },
    { field: 'color', label: 'farge', oldValue: 'green', newValue: 'blue' },
  ]);
});

test('the preview classifies new, unchanged, changed, invalid and ambiguous rows', () => {
  const existingEntries = [
    {
      id: 10,
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-02',
      title: 'Sommerfest',
      description: null,
      color: 'green',
      showOnHomepage: true,
      showForParents: false,
    },
    {
      id: 11,
      schoolYear: 2027,
      year: 2027,
      month: 12,
      entryType: 'closed',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2027-12-24',
      title: 'Julaften',
      description: null,
      color: 'red',
      showOnHomepage: false,
      showForParents: false,
    },
    {
      id: 12,
      schoolYear: 2027,
      year: 2027,
      month: 9,
      entryType: 'week_event',
      weekNumber: 36,
      weekNumberEnd: null,
      date: null,
      title: 'Dugnad',
      description: null,
      color: 'orange',
      showOnHomepage: false,
      showForParents: false,
    },
    {
      id: 13,
      schoolYear: 2027,
      year: 2027,
      month: 10,
      entryType: 'week_event',
      weekNumber: 40,
      weekNumberEnd: null,
      date: null,
      title: 'Dugnad',
      description: null,
      color: 'orange',
      showOnHomepage: false,
      showForParents: false,
    },
  ];

  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries,
    rows: [
      { rowNumber: 2, ...validDayRow({ dato: '2028-06-04', beskrivelse: '' }) },
      {
        rowNumber: 3,
        entry_type: 'closed',
        tittel: 'Julaften',
        dato: '2027-12-24',
        [YEAR_COLUMN]: 2027,
        [MONTH_COLUMN]: 12,
        farge: 'red',
      },
      { rowNumber: 4, ...validWeekRow() },
      { rowNumber: 5, ...validWeekRow({ entry_type: 'bad_type' }) },
      { rowNumber: 6, ...validWeekRow({ tittel: ' dugnad ' }) },
    ],
  });

  assert.equal(preview.rows[0].status, 'changed');
  assert.deepEqual(preview.rows[0].changes, [
    { field: 'date', label: 'dato', oldValue: '2028-06-02', newValue: '2028-06-04' },
  ]);
  assert.equal(preview.rows[1].status, 'unchanged');
  assert.equal(preview.rows[2].status, 'new');
  assert.equal(preview.rows[3].status, 'invalid');
  assert.equal(preview.rows[4].status, 'ambiguous');
  assert.deepEqual(preview.counts, {
    new: 1,
    unchanged: 1,
    changed: 1,
    invalid: 1,
    ambiguous: 1,
  });
});

test('the preview ignores snake_case rows from another school year', () => {
  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries: [
      {
        id: 20,
        school_year: 2026,
        year: 2027,
        month: 6,
        entry_type: 'day_event',
        week_number: null,
        week_number_end: null,
        date: '2027-06-04',
        title: 'Sommerfest',
        description: null,
        color: 'green',
        show_on_homepage: true,
        show_for_parents: false,
      },
    ],
    rows: [
      {
        rowNumber: 2,
        ...validDayRow({ beskrivelse: '', dato: '2028-06-04' }),
      },
    ],
  });

  assert.equal(preview.rows[0].status, 'new');
  assert.deepEqual(preview.counts, {
    new: 1,
    unchanged: 0,
    changed: 0,
    invalid: 0,
    ambiguous: 0,
  });
});

test('the preview normalizes a snake_case database row before comparing', () => {
  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries: [
      {
        id: 21,
        school_year: 2027,
        year: 2028,
        month: 6,
        entry_type: 'day_event',
        week_number: null,
        week_number_end: null,
        date: '2028-06-04',
        title: 'Sommerfest',
        description: '',
        color: 'green',
        show_on_homepage: true,
        show_for_parents: false,
      },
    ],
    rows: [
      {
        rowNumber: 2,
        ...validDayRow({ beskrivelse: '', dato: '2028-06-04' }),
      },
    ],
  });

  assert.equal(preview.rows[0].status, 'unchanged');
  assert.equal(preview.rows[0].existing.schoolYear, 2027);
  assert.equal(preview.rows[0].existing.entryType, 'day_event');
  assert.equal(preview.rows[0].existing.weekNumber, null);
  assert.equal(preview.rows[0].existing.showOnHomepage, true);
  assert.equal(preview.rows[0].existing.showForParents, false);
});

test('titles match case- and whitespace-insensitively, Norwegian letters included', () => {
  assert.equal(normalizeYearlyCalendarTitle('  Sommerfest   Juni '), 'sommerfest juni');
  assert.equal(normalizeYearlyCalendarTitle(' BL\u00c5B\u00c6R  og   GR\u00d8T '), 'bl\u00e5b\u00e6r og gr\u00f8t');
  assert.equal(normalizeYearlyCalendarTitle(null), '');
});

test('only dated entry types can be sent in the newsletter', () => {
  for (const type of ['day_event', 'closed']) assert.equal(supportsYearlyCalendarNewsletter(type), true, type);
  for (const type of ['week_event', 'food', 'note', 'not-real']) assert.equal(supportsYearlyCalendarNewsletter(type), false, type);
});
