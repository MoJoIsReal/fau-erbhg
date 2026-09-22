import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveYearlyCalendarPlacement as place, yearlyCalendarEntryOverlapsMonth as overlaps } from '../shared/yearly-calendar-placement.js';

const base = { entryType: 'day_event', year: 2026, month: 9, date: '2026-09-22', weekNumber: 39 };

test('moving a dated entry updates month, week and school year together', () => {
  const july = place({ ...base, date: '2027-07-31' });
  const august = place({ ...base, date: '2027-08-01' });
  assert.equal(july.schoolYear, 2026);
  assert.equal(august.schoolYear, 2027);
  assert.equal(august.year, 2027);
  assert.equal(august.month, 8);
  assert.equal(august.weekNumber, 30);
  assert.equal(august.weekNumberEnd, null);
  assert.equal(place({ ...base, date: '2027-02-30' }), null);
});

test('closed dates follow the same placement rule without carrying weekday spans', () => {
  const result = place({ ...base, entryType: 'closed', weekdayStart: 1, weekdayEnd: 3 });
  assert.equal(result.date, base.date);
  assert.equal(result.weekdayStart, null);
  assert.equal(result.weekdayEnd, null);
});

test('moving a week to another year preserves its span and selected weekdays', () => {
  const result = place({ ...base, entryType: 'week_event', year: 2027, month: 9, weekNumber: 36, weekNumberEnd: 38, weekdayStart: 2, weekdayEnd: 5 });
  assert.equal(result.schoolYear, 2027);
  assert.equal(result.date, null);
  assert.equal(result.weekNumber, 36);
  assert.equal(result.weekNumberEnd, 38);
  assert.equal(result.weekdayStart, 2);
  assert.equal(result.weekdayEnd, 5);
});

test('month notes need no week; food clears ranges left from another entry type', () => {
  const note = place({ ...base, entryType: 'note', weekNumber: null, weekNumberEnd: 40, weekdayStart: 2, weekdayEnd: 4 });
  assert.equal(note.weekNumber, null);
  assert.equal(note.weekNumberEnd, null);
  assert.equal(note.weekdayStart, null);
  const food = place({ ...base, entryType: 'food', weekNumberEnd: 40, weekdayStart: 2, weekdayEnd: 4 });
  assert.equal(food.weekNumber, 39);
  assert.equal(food.weekNumberEnd, null);
  assert.equal(food.weekdayEnd, null);
});

test('invalid or incomplete week ranges cannot silently change the saved placement', () => {
  for (const invalid of [
    { weekNumber: null }, { weekNumber: 0 }, { weekNumber: 54 }, { weekNumber: 2.5 },
    { weekNumberEnd: 38 }, { weekdayStart: 2 }, { weekdayStart: 6, weekdayEnd: 2 },
    { month: 13 }, { year: 0 },
  ]) assert.equal(place({ ...base, entryType: 'week_event', ...invalid }), null);
});

test('moving just the week follows its new month and school year', () => {
  const result = place({ ...base, entryType: 'week_event', weekNumber: 6 });
  assert.equal(result.year, 2026);
  assert.equal(result.month, 2);
  assert.equal(result.schoolYear, 2025);
  assert.equal(place({ ...base, entryType: 'food', year: 2027, weekNumber: 53 }), null);
});

test('month lists and PDFs include week spans crossing month boundaries', () => {
  const entry = { ...base, entryType: 'week_event', date: null, weekNumber: 40, weekNumberEnd: 41 };
  assert.equal(overlaps(entry, 2026, 9), true);
  assert.equal(overlaps(entry, 2026, 10), true);
  assert.equal(overlaps(entry, 2026, 11), false);
  assert.equal(overlaps({ ...entry, weekNumberEnd: 40, weekdayStart: 4, weekdayEnd: 5 }, 2026, 9), false);
  assert.equal(overlaps({ ...entry, weekNumber: 45, weekNumberEnd: 45 }, 2026, 9), false);
  assert.equal(overlaps({ ...entry, weekNumber: 45, weekNumberEnd: 45 }, 2026, 11), true);
});

test('month matching respects dates, undated notes and ISO year boundaries', () => {
  assert.equal(overlaps(base, 2026, 9), true);
  assert.equal(overlaps(base, 2026, 10), false);
  assert.equal(overlaps({ ...base, date: null, weekNumber: null }, 2026, 10), false);
  assert.equal(overlaps({ ...base, date: null, weekNumber: null }, 2026, 9), true);
  const boundary = { ...base, year: 2026, month: 12, date: null, weekNumber: 53 };
  assert.equal(overlaps(boundary, 2027, 1), true);
  assert.equal(overlaps(boundary, 2028, 1), false);
});
