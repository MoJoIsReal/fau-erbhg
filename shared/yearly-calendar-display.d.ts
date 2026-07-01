export type YearlyCalendarMonthRef = {
  year: number;
  month: number;
};

export type YearlyCalendarMonthGroups = {
  currentAndUpcoming: YearlyCalendarMonthRef[];
  past: YearlyCalendarMonthRef[];
};

export type YearlyCalendarTodayMarker = {
  date: string;
  weekNumber: number;
  monthValue: number;
};

export function monthsForSchoolYear(schoolYear: number): YearlyCalendarMonthRef[];

export function monthOrderValue(monthRef: YearlyCalendarMonthRef): number;

export function isoWeek(date: Date): number;

export function toCalendarIsoDate(date: Date): string;

export function getYearlyCalendarTodayMarker(currentDate?: Date): YearlyCalendarTodayMarker;

export function getYearlyCalendarMonthGroups(
  schoolYear: number,
  currentDate?: Date,
): YearlyCalendarMonthGroups;
