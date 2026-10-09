import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event, YearlyCalendarEntry } from "@shared/schema";
import type { CalendarEntry } from "@shared/calendar-entries";
import { mergeCalendarEntries } from "@shared/calendar-entries";
import { getKindergartenSchoolYear } from "@/lib/kindergarten-year";
import { apiRequest } from "@/lib/queryClient";

export type UseCalendarEntriesResult = {
  entries: CalendarEntry[];
  yearlyEntries: YearlyCalendarEntry[];
  events: Event[];
  exportsReady: boolean;
  hasDataError: boolean;
  isLoading: boolean;
  isError: boolean;
};

/**
 * The whole calendar as one list: signup events and yearly-calendar entries,
 * normalized to a common shape and sorted by week. The merging rules live in
 * `shared/calendar-entries.js` so they are covered by
 * `tests/calendar-entries.test.mjs`; this hook only does the fetching.
 *
 * Queries use the same keys as the editor and exports, so TanStack Query serves
 * them from the same cache rather than refetching.
 */
export function useCalendarEntries(schoolYear = getKindergartenSchoolYear(new Date())): UseCalendarEntriesResult {
  // `/api/events` starts at the previous school year by default, which covers
  // the current year's calendar. Paged further back, ask for more under a
  // second key; `["/api/events"]` invalidations still reach it by prefix.
  const from = schoolYear < getKindergartenSchoolYear(new Date()) ? `${schoolYear - 1}-08-01` : null;
  const eventsQuery = useQuery<Event[]>(
    from
      ? {
          queryKey: ["/api/events", { from }],
          queryFn: () => apiRequest("GET", `/api/events?from=${from}`).then((res) => res.json()),
        }
      : { queryKey: ["/api/events"] },
  );

  // Adjacent school years cover grid days and week bands crossing August,
  // read in one call.
  const yearlyQuery = useQuery<YearlyCalendarEntry[]>({
    queryKey: [`/api/yearly-calendar?fromSchoolYear=${schoolYear - 1}&toSchoolYear=${schoolYear + 1}`],
  });

  const events = eventsQuery.data;
  const yearlyEntries = useMemo(() => yearlyQuery.data ?? [], [yearlyQuery.data]);
  const entries = useMemo(
    () =>
      mergeCalendarEntries({
        events: events ?? [],
        entries: yearlyEntries,
      }),
    [events, yearlyEntries],
  );

  return {
    entries,
    yearlyEntries,
    events: events ?? [],
    exportsReady: eventsQuery.isSuccess && yearlyQuery.isSuccess,
    hasDataError: eventsQuery.isError || yearlyQuery.isError,
    isLoading: eventsQuery.isLoading || yearlyQuery.isLoading,
    // Either source alone still makes a useful calendar; only give up when
    // both are unavailable.
    isError: eventsQuery.isError && yearlyQuery.isError,
  };
}
