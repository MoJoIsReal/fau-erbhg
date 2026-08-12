import { useQuery } from "@tanstack/react-query";
import type { Event, YearlyCalendarEntry } from "@shared/schema";
import { getKindergartenSchoolYear } from "@/lib/kindergarten-year";

// One upcoming row on the homepage / in the footer: either a real FAU event
// or a yearly-calendar entry (closed day or flagged day event).
export type UpcomingItem =
  | { kind: "event"; date: string; event: Event }
  | { kind: "yearly"; date: string; entry: YearlyCalendarEntry };

/**
 * Merged, date-sorted list of what happens next: active events plus the
 * yearly-calendar entries parents should see (closed days always; day events
 * when flagged for the homepage/parents).
 *
 * Shared by the homepage and the footer so both render from the same three
 * queries (TanStack Query dedupes on the identical keys) instead of each
 * maintaining its own copy of the filtering rules.
 */
export function useUpcomingItems(): UpcomingItem[] {
  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  // Fetch the current and next school year so the list stays correct around
  // the August transition — the kindergarten year starts in August.
  const currentSchoolYear = getKindergartenSchoolYear(new Date());
  const { data: currentYearEntries = [] } = useQuery<YearlyCalendarEntry[]>({
    queryKey: [`/api/yearly-calendar?schoolYear=${currentSchoolYear}`],
  });
  const { data: nextYearEntries = [] } = useQuery<YearlyCalendarEntry[]>({
    queryKey: [`/api/yearly-calendar?schoolYear=${currentSchoolYear + 1}`],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const eventItems: UpcomingItem[] = events
    .filter((event) => event.status === "active" && new Date(event.date).getTime() >= todayMs)
    .map((event) => ({ kind: "event" as const, date: event.date, event }));

  const yearlyItems: UpcomingItem[] = [...currentYearEntries, ...nextYearEntries]
    .filter((entry) => {
      if (!entry.date || new Date(entry.date).getTime() < todayMs) return false;
      // "Closed" days (planleggingsdag, ferie etc.) always surface so parents
      // see them without anyone having to flag them.
      if (entry.entryType === "closed") return true;
      // Day events only show when at least one homepage flag is set.
      if (entry.entryType === "day_event") {
        return entry.showOnHomepage === true || entry.showForParents === true;
      }
      return false;
    })
    .map((entry) => ({ kind: "yearly" as const, date: entry.date as string, entry }));

  return [...eventItems, ...yearlyItems].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}
