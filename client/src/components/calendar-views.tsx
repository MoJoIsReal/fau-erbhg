import { lazy, Suspense, useMemo, useState } from "react";
import { List, Loader2, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CalendarEntry, CalendarEntryKind } from "@shared/calendar-entries";
import {
  CALENDAR_ENTRY_KINDS,
  EVENT_CALENDAR_KINDS,
  YEARLY_CALENDAR_KINDS,
  calendarWeekKey,
  isoWeekYear,
} from "@shared/calendar-entries";
import { isoWeek } from "@shared/yearly-calendar-display";
import { useCalendarEntries } from "@/hooks/useCalendarEntries";
import { useLanguage } from "@/contexts/LanguageContext";
import { CHIP_OFF, KIND_STYLE } from "@/lib/calendar-kind-style";
import type { Event } from "@shared/schema";
import CalendarEntryList from "@/components/calendar-entry-list";
import EventRegistrationModal from "@/components/event-registration-modal";

// The month grid is only paid for when someone switches to it.
const CalendarView = lazy(() => import("@/components/calendar-view"));

type CalendarViewMode = "list" | "month";

function allKindsOn(): Record<CalendarEntryKind, boolean> {
  return CALENDAR_ENTRY_KINDS.reduce(
    (acc, kind) => ({ ...acc, [kind]: true }),
    {} as Record<CalendarEntryKind, boolean>,
  );
}

/**
 * The combined calendar: one set of entries, one set of filters, and the
 * views that render them. Week list and month grid are two ways of looking at
 * the same data rather than two pages, so the filters and the fetch live here
 * and switching between them keeps what you switched off, switched off.
 */
export default function CalendarViews() {
  const { t } = useLanguage();
  const { entries, isLoading, isError } = useCalendarEntries();
  const [active, setActive] = useState<Record<CalendarEntryKind, boolean>>(allKindsOn);
  const [mode, setMode] = useState<CalendarViewMode>("list");
  const [showPast, setShowPast] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const today = new Date();
  const currentWeekKey = calendarWeekKey(isoWeekYear(today), isoWeek(today));

  const visible = useMemo(() => entries.filter((entry) => active[entry.kind]), [entries, active]);
  const activeCount = CALENDAR_ENTRY_KINDS.filter((kind) => active[kind]).length;

  const toggle = (kind: CalendarEntryKind) => setActive((prev) => ({ ...prev, [kind]: !prev[kind] }));

  // The month grid always shows a whole month, past days included, so the
  // list's "from this week on" cutoff would only ever blank out its first
  // rows. It applies to the list alone.
  const openEntry = (entry: CalendarEntry) => {
    if (entry.event) setSelectedEvent(entry.event);
  };

  const renderChips = (kinds: readonly CalendarEntryKind[], label: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</span>
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => toggle(kind)}
          aria-pressed={active[kind]}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 ${
            active[kind] ? KIND_STYLE[kind].chip : CHIP_OFF
          }`}
        >
          {t.calendar.kinds[kind]}
        </button>
      ))}
    </div>
  );

  const modes: { id: CalendarViewMode; label: string; icon: typeof List }[] = [
    { id: "list", label: t.calendar.listView, icon: List },
    { id: "month", label: t.calendar.monthView, icon: CalendarDays },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-neutral-600 dark:text-neutral-300">
          {t.calendar.loadFailed}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700"
            role="group"
            aria-label={t.calendar.viewLabel}
          >
            {modes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                  mode === id
                    ? "bg-primary text-primary-foreground"
                    : "bg-white text-neutral-600 hover:text-neutral-900 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:text-neutral-50"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="tabular-nums">
              {activeCount}/{CALENDAR_ENTRY_KINDS.length} {t.calendar.typesOn}
            </span>
            {activeCount < CALENDAR_ENTRY_KINDS.length && (
              <button
                type="button"
                onClick={() => setActive(allKindsOn())}
                className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-50"
              >
                {t.calendar.showAllTypes}
              </button>
            )}
          </div>
        </div>

        {renderChips(EVENT_CALENDAR_KINDS, t.calendar.filterSignup)}
        {renderChips(YEARLY_CALENDAR_KINDS, t.calendar.filterKindergarten)}
      </div>

      {mode === "list" ? (
        <CalendarEntryList
          entries={visible}
          fromWeekKey={showPast ? null : currentWeekKey}
          currentWeekKey={currentWeekKey}
          onShowEarlier={showPast ? null : () => setShowPast(true)}
          onRegister={setSelectedEvent}
          emptyMessage={activeCount === 0 ? t.calendar.noTypesSelected : t.calendar.nothingMatches}
        />
      ) : (
        <Suspense
          fallback={
            <div className="flex justify-center py-16" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }
        >
          <CalendarView entries={visible} onEntryClick={openEntry} />
        </Suspense>
      )}

      <EventRegistrationModal
        event={selectedEvent}
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
