import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALENDAR_DAYS_PER_WEEK,
  getYearlyCalendarMonthGroups,
  getYearlyCalendarTodayMarker,
  isWeekendIndex,
  weeksOfMonth,
} from '../shared/yearly-calendar-display.js';
import { getKindergartenSchoolYear, isMonthInSchoolYear } from '../shared/yearly-calendar-utils.js';

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('every week runs Monday through Sunday', () => {
  for (const week of weeksOfMonth(2026, 9)) {
    assert.equal(week.days.length, CALENDAR_DAYS_PER_WEEK);
    // 1 = Monday, 0 = Sunday in Date terms.
    assert.equal(week.days[0].date.getDay(), 1);
    assert.equal(week.days[6].date.getDay(), 0);
    assert.deepEqual(
      week.days.map((day) => day.isWeekend),
      [false, false, false, false, false, true, true],
    );
  }
});

test('days are consecutive — the weekend is no longer skipped', () => {
  const days = weeksOfMonth(2026, 9).flatMap((week) => week.days);
  for (let index = 1; index < days.length; index++) {
    const gap = (days[index].date - days[index - 1].date) / 86400000;
    assert.equal(Math.round(gap), 1);
  }
});

test('the grid covers the whole month and marks neighbouring days', () => {
  const weeks = weeksOfMonth(2026, 2);
  const days = weeks.flatMap((week) => week.days);
  const inMonth = days.filter((day) => day.inMonth).map((day) => isoDate(day.date));

  assert.equal(inMonth.length, 28);
  assert.equal(inMonth[0], '2026-02-01');
  assert.equal(inMonth.at(-1), '2026-02-28');
  // February 2026 starts on a Sunday, so the first row is mostly January.
  assert.equal(days[0].inMonth, false);
  assert.equal(isoDate(days[0].date), '2026-01-26');
});

test('a month ending on a Sunday does not add an empty trailing week', () => {
  // 31 May 2026 is a Sunday.
  const weeks = weeksOfMonth(2026, 5);
  assert.equal(isoDate(weeks.at(-1).days[6].date), '2026-05-31');
  for (const week of weeks) {
    assert.equal(week.days.some((day) => day.inMonth), true);
  }
});

test('ISO week numbers survive the year boundary', () => {
  const january = weeksOfMonth(2027, 1);
  assert.equal(january[0].weekNumber, 53);
  assert.equal(january[1].weekNumber, 1);
});

test('weekend indexes are the last two columns', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(isWeekendIndex), [
    false, false, false, false, false, true, true,
  ]);
});

test('the kindergarten year turns over on 1 August', () => {
  assert.equal(getKindergartenSchoolYear(new Date('2026-01-15T12:00:00Z')), 2025);
  assert.equal(getKindergartenSchoolYear(new Date('2026-07-31T12:00:00Z')), 2025);
  assert.equal(getKindergartenSchoolYear(new Date('2026-08-01T12:00:00Z')), 2026);
  assert.equal(getKindergartenSchoolYear(new Date('2026-12-31T12:00:00Z')), 2026);
  assert.equal(isMonthInSchoolYear(2027, 8, 2027), true);
  assert.equal(isMonthInSchoolYear(2028, 7, 2027), true);
  assert.equal(isMonthInSchoolYear(2028, 8, 2027), false);
  assert.equal(isMonthInSchoolYear(2027, 7, 2027), false);
});

test('month groups split the current month from past months, newest first', () => {
  const groups = getYearlyCalendarMonthGroups(2025, new Date('2026-07-01T12:00:00Z'));
  assert.deepEqual(groups.currentAndUpcoming, [{ year: 2026, month: 7 }]);
  assert.deepEqual(groups.past.slice(0, 3), [
    { year: 2026, month: 6 },
    { year: 2026, month: 5 },
    { year: 2026, month: 4 },
  ]);
  assert.deepEqual(groups.past.at(-1), { year: 2025, month: 8 });
});

test('the today marker carries the date, ISO week and a sortable month value', () => {
  assert.deepEqual(getYearlyCalendarTodayMarker(new Date('2026-07-01T12:00:00Z')), {
    date: '2026-07-01',
    weekNumber: 27,
    monthValue: 2026 * 12 + 7,
  });
});
