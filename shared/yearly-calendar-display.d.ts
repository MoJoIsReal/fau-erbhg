export type YearlyCalendarMonthRef = {
  year: number;
  month: number;
};

export function monthsForSchoolYear(schoolYear: number): YearlyCalendarMonthRef[];

export function isoWeek(date: Date): number;

export function toCalendarIsoDate(date: Date): string;

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
