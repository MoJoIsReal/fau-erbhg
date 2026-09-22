import type { YearlyCalendarEntryType } from './yearly-calendar-utils';
import type { YearlyCalendarEntry } from './schema';

export type YearlyCalendarPlacement = {
  schoolYear: number;
  year: number;
  month: number;
  date: string | null;
  weekNumber: number | null;
  weekNumberEnd: number | null;
  weekdayStart: number | null;
  weekdayEnd: number | null;
};

export function resolveYearlyCalendarPlacement(input: {
  entryType: YearlyCalendarEntryType;
  year: number;
  month: number;
  date?: string | null;
  weekNumber?: number | null;
  weekNumberEnd?: number | null;
  weekdayStart?: number | null;
  weekdayEnd?: number | null;
}): YearlyCalendarPlacement | null;

export function yearlyCalendarEntryOverlapsMonth(entry: YearlyCalendarEntry, year: number, month: number): boolean;
