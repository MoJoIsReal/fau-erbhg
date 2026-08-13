import { lazy, Suspense } from "react";
import { Link, useRoute } from "wouter";
import { CalendarClock, CalendarDays, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";

// Both views are heavy (the yearly calendar pulls in dnd-kit, and the event
// calendar its own grid), so only the active tab is fetched.
const Events = lazy(() => import("@/pages/events"));
const YearlyCalendar = lazy(() => import("@/pages/yearly-calendar"));

export type CalendarTab = "upcoming" | "yearly";

const TAB_PATH: Record<CalendarTab, string> = {
  upcoming: "/kalender",
  yearly: "/kalender/arskalender",
};

function TabLoader() {
  return (
    <div className="flex justify-center py-16" role="status" aria-live="polite">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/**
 * Events and the yearly calendar used to be two top-level pages that both
 * showed kindergarten dates without explaining which belonged where — parents
 * had to guess twice. They are one page with two tabs now: "what's happening"
 * for things you sign up for, "yearly calendar" for the fixed dates of the
 * kindergarten year.
 */
export default function CalendarPage() {
  const { t, language } = useLanguage();
  const [isYearlyRoute] = useRoute("/kalender/arskalender");
  const activeTab: CalendarTab = isYearlyRoute ? "yearly" : "upcoming";

  usePageMeta({
    title: t.calendar.title,
    description:
      language === "no"
        ? "Samlet kalender for Erdal Barnehage: kommende arrangementer og møter du kan melde deg på, og årskalenderen med planleggingsdager og ferier."
        : "One calendar for Erdal Kindergarten: upcoming events and meetings you can sign up for, and the yearly calendar with planning days and holidays.",
    path: TAB_PATH[activeTab],
  });

  const tabs: { id: CalendarTab; label: string; hint: string; icon: typeof CalendarClock }[] = [
    {
      id: "upcoming",
      label: t.calendar.upcomingTab,
      hint: t.calendar.upcomingTabHint,
      icon: CalendarClock,
    },
    {
      id: "yearly",
      label: t.calendar.yearlyTab,
      hint: t.calendar.yearlyTabHint,
      icon: CalendarDays,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-3xl text-neutral-900 dark:text-neutral-50 mb-2">
          {t.calendar.title}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-300">{t.calendar.subtitle}</p>
      </div>

      {/* Tabs are real links so each view is bookmarkable and the browser
          back button moves between them. */}
      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <nav className="-mb-px flex gap-1" aria-label={t.calendar.title}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={TAB_PATH[tab.id]}
                aria-current={isActive ? "page" : undefined}
                title={tab.hint}
                className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 sm:px-4 ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-neutral-50"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {activeTab === "upcoming" ? t.calendar.upcomingTabHint : t.calendar.yearlyTabHint}
      </p>

      <Suspense fallback={<TabLoader />}>
        {activeTab === "upcoming" ? <Events embedded /> : <YearlyCalendar embedded />}
      </Suspense>
    </div>
  );
}
