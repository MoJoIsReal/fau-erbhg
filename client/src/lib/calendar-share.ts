// A shared calendar link is the calendar itself with one entry named in the
// query, so it needs no route of its own and falls back to the whole calendar
// when the entry is gone. The value is the merged entry id (`event-12`,
// `entry-5`) from shared/calendar-entries.js, which is why those ids are
// pinned in tests/calendar-entries.test.mjs: they now live on posters.
export const SHARED_ENTRY_PARAM = "vis";

/** Site-relative path that opens one calendar entry's detail panel. */
export function calendarEntryPath(entryId: string): string {
  return `/kalender?${SHARED_ENTRY_PARAM}=${encodeURIComponent(entryId)}`;
}
