import type { YearlyCalendarEntry } from './schema';

export type YearlyCalendarEntryType = 'week_event' | 'day_event' | 'food' | 'closed' | 'note';
export type YearlyCalendarColor = 'red' | 'yellow' | 'green' | 'blue' | 'orange' | 'pink' | 'purple';
export type ImportPreviewStatus = 'new' | 'unchanged' | 'changed' | 'invalid' | 'ambiguous';
export type ImportDecisionAction = 'create' | 'update' | 'ignore';

export const VALID_YEARLY_CALENDAR_ENTRY_TYPES: readonly [
  'week_event',
  'day_event',
  'food',
  'closed',
  'note',
];
export const VALID_YEARLY_CALENDAR_COLORS: readonly [
  'red',
  'yellow',
  'green',
  'blue',
  'orange',
  'pink',
  'purple',
];

export type YearlyCalendarImportPayload = {
  schoolYear: number;
  year: number;
  month: number;
  entryType: YearlyCalendarEntryType;
  title: string;
  description: string | null;
  color: YearlyCalendarColor | string | null;
  weekNumber: number | null;
  weekNumberEnd: number | null;
  date: string | null;
  showOnHomepage: boolean;
  showForParents: boolean;
};

export type YearlyCalendarRawImportRow = {
  rowNumber?: number;
  entry_type?: unknown;
  entryType?: unknown;
  tittel?: unknown;
  title?: unknown;
  dato?: unknown;
  date?: unknown;
  "\u00e5r"?: unknown;
  year?: unknown;
  "m\u00e5ned"?: unknown;
  month?: unknown;
  uke_fra?: unknown;
  weekNumber?: unknown;
  uke_til?: unknown;
  weekNumberEnd?: unknown;
  beskrivelse?: unknown;
  description?: unknown;
  farge?: unknown;
  color?: unknown;
  vis_p\u00e5_forside?: unknown;
  showOnHomepage?: unknown;
  for_foreldre?: unknown;
  showForParents?: unknown;
};

export type YearlyCalendarImportValidationResult =
  | {
      ok: true;
      rowNumber: number;
      payload: YearlyCalendarImportPayload;
    }
  | {
      ok: false;
      rowNumber: number;
      errors: string[];
    };

export type YearlyCalendarEntryDiff = {
  field: keyof YearlyCalendarImportPayload;
  label: string;
  oldValue: unknown;
  newValue: unknown;
};

export type ImportPreviewRow =
  | {
      rowNumber: number;
      status: 'new';
      payload: YearlyCalendarImportPayload;
      original: YearlyCalendarRawImportRow;
      defaultAction: 'create';
    }
  | {
      rowNumber: number;
      status: 'unchanged';
      payload: YearlyCalendarImportPayload;
      existing: YearlyCalendarEntry;
      original: YearlyCalendarRawImportRow;
      defaultAction: 'ignore';
    }
  | {
      rowNumber: number;
      status: 'changed';
      payload: YearlyCalendarImportPayload;
      existing: YearlyCalendarEntry;
      changes: YearlyCalendarEntryDiff[];
      original: YearlyCalendarRawImportRow;
      defaultAction: 'ignore';
    }
  | {
      rowNumber: number;
      status: 'invalid';
      errors: string[];
      original: YearlyCalendarRawImportRow;
      defaultAction: 'ignore';
    }
  | {
      rowNumber: number;
      status: 'ambiguous';
      payload: YearlyCalendarImportPayload;
      matches: YearlyCalendarEntry[];
      original: YearlyCalendarRawImportRow;
      defaultAction: 'ignore';
    };

export type ImportPreview = {
  schoolYear: number;
  rows: ImportPreviewRow[];
  counts: Record<ImportPreviewStatus, number>;
};

export type ImportDecisionValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

export function getKindergartenSchoolYear(date?: Date): number;
export function normalizeYearlyCalendarTitle(value: unknown): string;
export function isMonthInSchoolYear(year: number, month: number, schoolYear: number): boolean;
export function validateYearlyCalendarImportRow(args: {
  rowNumber: number;
  schoolYear: number;
  row: YearlyCalendarRawImportRow;
}): YearlyCalendarImportValidationResult;
export function diffYearlyCalendarEntry(
  existingEntry: Partial<YearlyCalendarEntry> | Record<string, unknown>,
  payload: YearlyCalendarImportPayload,
): YearlyCalendarEntryDiff[];
export function buildImportPreview(args: {
  schoolYear: number;
  existingEntries: Array<Partial<YearlyCalendarEntry> | Record<string, unknown>>;
  rows: YearlyCalendarRawImportRow[];
}): ImportPreview;
export function validateImportDecision(args: {
  status: ImportPreviewStatus;
  action: ImportDecisionAction;
}): ImportDecisionValidationResult;
