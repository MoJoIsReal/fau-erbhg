import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALENDAR_DAYS_PER_WEEK,
  isWeekendIndex,
  weeksOfMonth,
} from '../shared/yearly-calendar-display.js';

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
