export function monthsForSchoolYear(schoolYear) {
  const months = [];
  for (let month = 8; month <= 12; month++) {
    months.push({ year: schoolYear, month });
  }
  for (let month = 1; month <= 7; month++) {
    months.push({ year: schoolYear + 1, month });
  }
  return months;
}

export function monthOrderValue(monthRef) {
  return monthRef.year * 12 + monthRef.month;
}

export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function toCalendarIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getYearlyCalendarTodayMarker(currentDate = new Date()) {
  return {
    date: toCalendarIsoDate(currentDate),
    weekNumber: isoWeek(currentDate),
    monthValue: monthOrderValue({
      year: currentDate.getFullYear(),
      month: currentDate.getMonth() + 1,
    }),
  };
}

export function getYearlyCalendarMonthGroups(schoolYear, currentDate = new Date()) {
  const months = monthsForSchoolYear(schoolYear);
  const currentMonthValue = monthOrderValue({
    year: currentDate.getFullYear(),
    month: currentDate.getMonth() + 1,
  });
  const currentAndUpcoming = months.filter(
    (monthRef) => monthOrderValue(monthRef) >= currentMonthValue,
  );
  const past = months
    .filter((monthRef) => monthOrderValue(monthRef) < currentMonthValue)
    .sort((a, b) => monthOrderValue(b) - monthOrderValue(a));

  return { currentAndUpcoming, past };
}

// The calendar grid runs Monday→Sunday. The kindergarten week is Mon–Fri, but
// FAU arrangements (dugnad, sommerfest) land on weekends, so the weekend has
// to exist in the grid for those to be visible at all. Callers mark the two
// last cells as weekend rather than dropping them.
export const CALENDAR_DAYS_PER_WEEK = 7;

export function isWeekendIndex(dayIndex) {
  return dayIndex >= 5;
}

/**
 * Weeks (Mon–Sun) overlapping a given month, each with its ISO week number.
 * Leading/trailing days from the neighbouring months are included with
 * `inMonth: false` so the grid stays rectangular.
 */
export function weeksOfMonth(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const dayOfWeek = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - dayOfWeek);

  const weeks = [];
  while (true) {
    const days = [];
    for (let i = 0; i < CALENDAR_DAYS_PER_WEEK; i++) {
      const date = new Date(cursor);
      days.push({
        date,
        inMonth: date.getMonth() + 1 === month,
        isWeekend: isWeekendIndex(i),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ weekNumber: isoWeek(days[0].date), days });
    if (days[CALENDAR_DAYS_PER_WEEK - 1].date >= last) break;
  }
  return weeks.filter((week) => week.days.some((day) => day.inMonth));
}
