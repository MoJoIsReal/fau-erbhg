import type { Event, YearlyCalendarEntry } from './schema';

export type EventCalendarKind = 'arrangement' | 'mote' | 'dugnad' | 'foto' | 'internt';
export type YearlyCalendarKind = 'bhgdag' | 'varmmat' | 'temauke' | 'stengt' | 'beskjed' | 'info';
export type CalendarEntryKind = EventCalendarKind | YearlyCalendarKind;
export type CalendarEntrySource = 'event' | 'yearly';
export type CalendarDisplayKind = 'bhgdag' | 'arrangement' | 'info' | 'internt';
export const CALENDAR_DISPLAY_KINDS: readonly CalendarDisplayKind[];
export function calendarDisplayKind(kind: CalendarEntryKind): CalendarDisplayKind;
export function calendarDisplayKindForEntry(entry: Partial<YearlyCalendarEntry>): CalendarDisplayKind;
export type CalendarSignupMode = 'registration' | 'vigilo' | 'none' | 'internal';

export const EVENT_CALENDAR_KINDS: readonly EventCalendarKind[];
export const YEARLY_CALENDAR_KINDS: readonly YearlyCalendarKind[];
export const CALENDAR_ENTRY_KINDS: readonly CalendarEntryKind[];
/** Every kind a yearly entry may be categorised as, native table aside. */
export const YEARLY_CALENDAR_CATEGORIES: readonly CalendarEntryKind[];

export type CalendarSignupState = {
  mode: CalendarSignupMode;
  maxAttendees: number | null;
  currentAttendees: number;
  spotsLeft: number | null;
  isFull: boolean;
  deadline: string | null;
  deadlinePassed: boolean;
  isOpen: boolean;
};

export type CalendarEntry = {
  id: string;
  sourceId: number;
  source: CalendarEntrySource;
  kind: CalendarEntryKind;
  displayKind: CalendarDisplayKind;
  title: string;
  description: string;
  /** ISO date for a dated entry, null for one that spans whole weeks. */
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string;
  week: number;
  weekEnd: number;
  weekYear: number;
  weekKey: number;
  weekEndKey: number;
  weekdayStart: number | null;
  weekdayEnd: number | null;
  sortKey: number;
  cancelled: boolean;
  signup: CalendarSignupState | null;
  color: string | null;
  event: Event | null;
  entry: YearlyCalendarEntry | null;
};

export type CalendarWeekGroup = {
  weekKey: number;
  weekYear: number;
  week: number;
  spanning: CalendarEntry[];
  dated: CalendarEntry[];
};

export function calendarKindForEventType(type: unknown): CalendarEntryKind;
export function calendarKindForEntryType(entryType: unknown): CalendarEntryKind;
export function calendarKindSource(kind: CalendarEntryKind): CalendarEntrySource;
export function calendarKindForEntry(entry: unknown): CalendarEntryKind;

export function parseCalendarDate(value: unknown): Date | null;
export function isoWeekYear(date: Date): number;
export function isoWeekYearForRow(year: number, month: number, weekNumber: number): number;
export function calendarWeekKey(weekYear: number, weekNumber: number): number;

export function describeEventSignup(event: Event, now?: Date): CalendarSignupState;

export function normalizeEvent(event: Event, now?: Date): CalendarEntry | null;
export function normalizeYearlyEntry(entry: YearlyCalendarEntry): CalendarEntry | null;

export function dropDayEntriesCoveredByEvents(entries: CalendarEntry[]): CalendarEntry[];

export function mergeCalendarEntries(input?: {
  events?: Event[];
  entries?: YearlyCalendarEntry[];
  now?: Date;
}): CalendarEntry[];

export function compareSpanningEntries(a: CalendarEntry, b: CalendarEntry): number;

export function groupCalendarEntriesByWeek(
  entries: CalendarEntry[],
  options?: { fromWeekKey?: number | null },
): CalendarWeekGroup[];

export type SchoolYearWeek = {
  week: number;
  weekYear: number;
  /** 1-12, the month this week's Thursday falls in. */
  month: number;
  year: number;
  monday: Date;
};

export function schoolYearWeeks(schoolYear: number): SchoolYearWeek[];

export function mondayOfIsoWeek(weekYear: number, weekNumber: number): Date;
export function isoWeekRange(weekYear: number, weekNumber: number): { start: Date; end: Date };
