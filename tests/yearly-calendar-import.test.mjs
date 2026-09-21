import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImportPreview } from '../shared/yearly-calendar-utils.js';

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
