import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Event } from "@shared/schema";
import { upcomingEventsJsonLd } from "@shared/structured-data";
import { useLanguage } from "@/contexts/LanguageContext";
import { BASE_URL, usePageMeta } from "@/hooks/usePageMeta";

// Heavy enough to be worth splitting: the month grid, the year strip and the
// editor modals all hang off it.
const CalendarViews = lazy(() => import("@/components/calendar-views"));

/**
 * The calendar.
 *
 * Events and the yearly calendar used to be two pages, then two tabs, and
 * both times a parent planning a single week had to look in both places — a
 * foreldremøte on Wednesday in one, a planleggingsdag on Friday in the other.
 * They are one calendar now, with list, month and year as views of it and the
 * old division reduced to what it always was: two groups of filter chips.
 */
export default function CalendarPage() {
  const { t } = useLanguage();
  // The same key the calendar views read, so this is not a second request.
  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  usePageMeta({
    title: t.seo.calendarTitle,
    description: t.seo.calendarDescription,
    path: "/kalender",
    // The events still ahead, so a search can show their date and place.
    jsonLd: upcomingEventsJsonLd(events, BASE_URL),
  });

  return (
    <div>
      {/* The calendar's own header band (PageHero) is the page's h1, and it
          changes with the view. Only the loading state needs a stand-in, so
          the page never has two h1s. */}
      <Suspense
        fallback={
          <>
            <h1 className="sr-only">{t.calendar.title}</h1>
            <div className="flex justify-center py-16" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </>
        }
      >
        <CalendarViews />
      </Suspense>
    </div>
  );
}
