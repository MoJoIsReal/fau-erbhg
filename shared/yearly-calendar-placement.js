import { parseCalendarDate, isoWeekYearForRow, isoWeekYear, mondayOfIsoWeek } from './calendar-entries.js';
import { getKindergartenSchoolYear } from './yearly-calendar-utils.js';
import { isoWeek } from './yearly-calendar-display.js';

/** Derive storage scope from the edited placement, including moves between school years. */
export function resolveYearlyCalendarPlacement({ entryType, year, month, date, weekNumber, weekNumberEnd, weekdayStart, weekdayEnd }) {
  if (entryType === 'day_event' || entryType === 'closed') {
    const parsed = parseCalendarDate(date);
    if (!parsed || getKindergartenSchoolYear(parsed) < 2020 || parsed.getFullYear() > 2100) return null;
    return {
      schoolYear: getKindergartenSchoolYear(parsed),
      year: parsed.getFullYear(), month: parsed.getMonth() + 1,
      date, weekNumber: isoWeek(parsed), weekNumberEnd: null,
      weekdayStart: null, weekdayEnd: null,
    };
  }
  if (!['week_event', 'food', 'note'].includes(entryType)) return null;
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const wholeMonth = entryType === 'note' && weekNumber == null;
  if (!wholeMonth && (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53)) return null;
  const weekYear = isoWeekYearForRow(year, month, weekNumber);
  if (!wholeMonth) {
    const start = mondayOfIsoWeek(weekYear, weekNumber);
    if (isoWeekYear(start) !== weekYear) return null;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    // A changed week may now be in another month (or school year). Keep an
    // explicitly chosen month if the week touches it; otherwise follow Thursday.
    if (start > new Date(year, month, 0) || end < new Date(year, month - 1, 1)) {
      const thursday = new Date(start);
      thursday.setDate(thursday.getDate() + 3);
      year = thursday.getFullYear();
      month = thursday.getMonth() + 1;
    }
  }
  const spanning = entryType !== 'food' && !wholeMonth;
  const end = spanning ? weekNumberEnd ?? null : null;
  if (end !== null && (!Number.isInteger(end) || end < weekNumber || end > 53)) return null;
  if (end !== null && isoWeekYear(mondayOfIsoWeek(weekYear, end)) !== weekYear) return null;
  const fromDay = spanning ? weekdayStart ?? null : null;
  const toDay = spanning ? weekdayEnd ?? null : null;
  if ((fromDay === null) !== (toDay === null)) return null;
  if (fromDay !== null && (!Number.isInteger(fromDay) || !Number.isInteger(toDay) || fromDay < 1 || toDay > 7 || fromDay > toDay)) return null;
  const schoolYear = getKindergartenSchoolYear(new Date(year, month - 1, 1));
  if (schoolYear < 2020 || year > 2100) return null;
  return {
    schoolYear,
    year, month, date: null, weekNumber: wholeMonth ? null : weekNumber,
    weekNumberEnd: end, weekdayStart: fromDay, weekdayEnd: toDay,
  };
}

/** Match the actual dates covered, so moving a week also moves it in exports. */
export function yearlyCalendarEntryOverlapsMonth(entry, year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const date = parseCalendarDate(entry.date);
  if (date) return date >= first && date <= last;
  if (entry.weekNumber == null) return entry.year === year && entry.month === month;
  const weekYear = isoWeekYearForRow(entry.year, entry.month, entry.weekNumber);
  const start = mondayOfIsoWeek(weekYear, entry.weekNumber);
  const end = mondayOfIsoWeek(weekYear, entry.weekNumberEnd ?? entry.weekNumber);
  start.setDate(start.getDate() + (entry.weekdayStart ?? 1) - 1);
  end.setDate(end.getDate() + (entry.weekdayEnd ?? 7) - 1);
  return start <= last && end >= first;
}
