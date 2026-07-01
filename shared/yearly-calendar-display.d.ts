export type YearlyCalendarMonthRef = {
  year: number;
  month: number;
};

export type YearlyCalendarMonthGroups = {
  currentAndUpcoming: YearlyCalendarMonthRef[];
  past: YearlyCalendarMonthRef[];
};

export function monthsForSchoolYear(schoolYear: number): YearlyCalendarMonthRef[];

export function monthOrderValue(monthRef: YearlyCalendarMonthRef): number;

export function getYearlyCalendarMonthGroups(
  schoolYear: number,
  currentDate?: Date,
): YearlyCalendarMonthGroups;
