import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";

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
  const { t, language } = useLanguage();

  usePageMeta({
    title: t.calendar.title,
    description:
      language === "no"
        ? "Samlet kalender for Erdal Barnehage, uke for uke: arrangementer og møter du kan melde deg på, ukens varmmat, temauker og planleggingsdager."
        : "One calendar for Erdal Kindergarten, week by week: events and meetings you can sign up for, weekly hot meals, theme weeks and planning days.",
    path: "/kalender",
  });

  return (
    <div>
      {/* The calendar's own header band carries the visible heading, and it
          changes with the view. The page keeps an h1 for the document
          outline and for anyone arriving by screen reader. */}
      <h1 className="sr-only">{t.calendar.title}</h1>

      <Suspense
        fallback={
          <div className="flex justify-center py-16" role="status" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <CalendarViews />
      </Suspense>
    </div>
  );
}
