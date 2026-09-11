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

export type YearlyCalendarDayCell = {
  date: Date;
  inMonth: boolean;
  isWeekend: boolean;
};

export type YearlyCalendarWeek = {
  weekNumber: number;
  days: YearlyCalendarDayCell[];
};

export const CALENDAR_DAYS_PER_WEEK: number;

export function isWeekendIndex(dayIndex: number): boolean;

export function weeksOfMonth(year: number, month: number): YearlyCalendarWeek[];
