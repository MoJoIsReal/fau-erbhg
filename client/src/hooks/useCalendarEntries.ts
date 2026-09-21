import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event, YearlyCalendarEntry } from "@shared/schema";
import type { CalendarEntry } from "@shared/calendar-entries";
import { mergeCalendarEntries } from "@shared/calendar-entries";
import { getKindergartenSchoolYear } from "@/lib/kindergarten-year";

export type UseCalendarEntriesResult = {
  entries: CalendarEntry[];
  isLoading: boolean;
  isError: boolean;
};

/**
 * The whole calendar as one list: signup events and yearly-calendar entries,
 * normalized to a common shape and sorted by week. The merging rules live in
 * `shared/calendar-entries.js` so they are covered by
 * `tests/calendar-entries.test.mjs`; this hook only does the fetching.
 *
 * Three queries, all on keys other pages already use, so TanStack Query serves
 * them from the same cache rather than refetching.
 */
export function useCalendarEntries(): UseCalendarEntriesResult {
  const eventsQuery = useQuery<Event[]>({ queryKey: ["/api/events"] });

  // The kindergarten year starts in August, so a calendar looking twelve
  // months ahead always straddles two of them.
  const schoolYear = getKindergartenSchoolYear(new Date());
  const currentYearQuery = useQuery<YearlyCalendarEntry[]>({
    queryKey: [`/api/yearly-calendar?schoolYear=${schoolYear}`],
  });
  const nextYearQuery = useQuery<YearlyCalendarEntry[]>({
    queryKey: [`/api/yearly-calendar?schoolYear=${schoolYear + 1}`],
  });

  const events = eventsQuery.data;
  const currentYearEntries = currentYearQuery.data;
  const nextYearEntries = nextYearQuery.data;

  const entries = useMemo(
    () =>
      mergeCalendarEntries({
        events: events ?? [],
        entries: [...(currentYearEntries ?? []), ...(nextYearEntries ?? [])],
      }),
    [events, currentYearEntries, nextYearEntries],
  );

  return {
    entries,
    isLoading: eventsQuery.isLoading || currentYearQuery.isLoading || nextYearQuery.isLoading,
    // A missing school year is not a failure worth blanking the page for —
    // only give up when every source is unavailable.
    isError: eventsQuery.isError && currentYearQuery.isError && nextYearQuery.isError,
  };
}
