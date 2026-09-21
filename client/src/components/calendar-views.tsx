import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, CalendarRange, List, Loader2 } from "lucide-react";
import type { CalendarEntry, CalendarEntryKind } from "@shared/calendar-entries";
import {
  CALENDAR_ENTRY_KINDS,
  EVENT_CALENDAR_KINDS,
  YEARLY_CALENDAR_KINDS,
  calendarWeekKey,
  isoWeekYear,
} from "@shared/calendar-entries";
import { isoWeek } from "@shared/yearly-calendar-display";
import { getKindergartenSchoolYear } from "@/lib/kindergarten-year";
import { useCalendarEntries } from "@/hooks/useCalendarEntries";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { Event } from "@shared/schema";
import CalendarEntryList from "@/components/calendar-entry-list";
import CalendarEntryDetail from "@/components/calendar-entry-detail";
import CalendarSubscribe from "@/components/calendar-subscribe";
import { useCalendarEditor } from "@/components/calendar-editor-tools";
import EventRegistrationModal from "@/components/event-registration-modal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// The grids are only paid for when someone switches to them.
const CalendarView = lazy(() => import("@/components/calendar-view"));
const CalendarYearView = lazy(() => import("@/components/calendar-year-view"));

type CalendarViewMode = "list" | "month" | "year";
export type MonthCursor = { year: number; month: number };

const VIEW_MODES: CalendarViewMode[] = ["list", "month", "year"];
const STORAGE_KEY = "fau-calendar-view";

// Which view and which filters someone last used is a convenience, not data:
// it lives in this browser only, and a blocked or cleared store just means
// everything is on and the list is showing.
type StoredPreferences = { mode?: CalendarViewMode; off?: CalendarEntryKind[] };

function readPreferences(): StoredPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredPreferences;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function allKindsOn(): Record<CalendarEntryKind, boolean> {
  return CALENDAR_ENTRY_KINDS.reduce(
    (acc, kind) => ({ ...acc, [kind]: true }),
    {} as Record<CalendarEntryKind, boolean>,
  );
}

function initialActive(): Record<CalendarEntryKind, boolean> {
  const off = new Set(readPreferences().off ?? []);
  const state = allKindsOn();
  for (const kind of CALENDAR_ENTRY_KINDS) if (off.has(kind)) state[kind] = false;
  return state;
}

function initialMode(): CalendarViewMode {
  const stored = readPreferences().mode;
  return stored && VIEW_MODES.includes(stored) ? stored : "list";
}

/**
 * The combined calendar: one set of entries, one set of filters, and the three
 * views that render them.
 *
 * The heading belongs here rather than to each view, because it is what tells
 * you where you are — the month you are looking at, or the kindergarten year —
 * and it changes as you move between them.
 */
export default function CalendarViews() {
  const { language, t } = useLanguage();
  const { entries, isLoading, isError } = useCalendarEntries();
  const [active, setActive] = useState<Record<CalendarEntryKind, boolean>>(initialActive);
  const [mode, setMode] = useState<CalendarViewMode>(initialMode);
  const [showPast, setShowPast] = useState(false);
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  // Opening is its own state, set by a click and cleared by a view change, so
  // switching views cannot make the panel spring open over the view you asked
  // to see.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const today = new Date();
  const currentWeekKey = calendarWeekKey(isoWeekYear(today), isoWeek(today));
  const thisSchoolYear = getKindergartenSchoolYear(new Date());
  const [schoolYear, setSchoolYear] = useState(thisSchoolYear);
  // The displayed month lives here so the heading can name it, and so the year
  // view can hand a month over to the month view.
  const [monthCursor, setMonthCursor] = useState<MonthCursor>({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });

  useEffect(() => {
    try {
      const off = CALENDAR_ENTRY_KINDS.filter((kind) => !active[kind]);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, off }));
    } catch {
      // A private window or blocked storage costs the convenience, nothing else.
    }
  }, [active, mode]);

  const visible = useMemo(() => entries.filter((entry) => active[entry.kind]), [entries, active]);
  const activeCount = CALENDAR_ENTRY_KINDS.filter((kind) => active[kind]).length;
  const allOn = activeCount === CALENDAR_ENTRY_KINDS.length;

  const toggle = (kind: CalendarEntryKind) => setActive((prev) => ({ ...prev, [kind]: !prev[kind] }));

  const openEntry = (entry: CalendarEntry) => {
    setSelected(entry);
    setSheetOpen(true);
  };
  const registerFor = (entry: CalendarEntry) => {
    if (entry.event) setSelectedEvent(entry.event);
  };
  const changeMode = (next: CalendarViewMode) => {
    setSheetOpen(false);
    setMode(next);
  };

  const editor = useCalendarEditor({ schoolYear });
  const schoolYearOptions = [thisSchoolYear - 1, thisSchoolYear, thisSchoolYear + 1];

  const modes: { id: CalendarViewMode; label: string; icon: typeof List }[] = [
    { id: "list", label: t.calendar.listView, icon: List },
    { id: "month", label: t.calendar.monthView, icon: CalendarDays },
    { id: "year", label: t.calendar.yearView, icon: CalendarRange },
  ];

  const heading =
    mode === "month"
      ? formatDate(new Date(monthCursor.year, monthCursor.month - 1, 1), language, {
          month: "long",
          year: "numeric",
        })
      : mode === "year"
        ? `${t.calendar.yearHeading} ${schoolYear}/${schoolYear + 1}`
        : t.calendar.listHeading;

  const intro =
    mode === "month"
      ? t.calendar.monthIntro
      : mode === "year"
        ? t.calendar.yearIntro
        : t.calendar.listIntro;

  const chip = (label: string, on: boolean, onClick: () => void, dot?: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 ${
        on
          ? dot
            ? "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            : "border-accent bg-accent font-medium text-accent-foreground"
          : "border-neutral-200 bg-white text-neutral-400 hover:text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-600 dark:hover:text-neutral-300"
      }`}
    >
      {dot && (
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${on ? dot : "bg-neutral-300 dark:bg-neutral-700"}`}
          aria-hidden="true"
        />
      )}
      {label}
    </button>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-16 text-center text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
        {t.calendar.loadFailed}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* A warm band rather than a plain heading: this is a kindergarten
          calendar, and the top of the page is the one place that can say so
          without getting in the way of the dates below. */}
      <header className="overflow-hidden rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50/60 to-emerald-50 px-6 py-8 dark:from-neutral-900 dark:via-neutral-900 dark:to-emerald-950/40 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              {t.calendar.title}
            </p>
            <h2
              className={`mt-2 font-heading text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-4xl ${
                mode === "month" ? "capitalize" : ""
              }`}
            >
              {heading}
            </h2>
            <p className="mt-3 text-neutral-600 dark:text-neutral-300">{intro}</p>
          </div>
          <p className="font-heading text-lg italic text-accent dark:text-emerald-300">
            {t.calendar.tagline}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-neutral-900"
          role="group"
          aria-label={t.calendar.viewLabel}
        >
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => changeMode(id)}
              aria-pressed={mode === id}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                mode === id
                  ? "bg-accent font-medium text-accent-foreground shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          {t.yearlyCalendar.schoolYearLabel}
          <select
            value={schoolYear}
            onChange={(event) => setSchoolYear(Number(event.target.value))}
            className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            {schoolYearOptions.map((year) => (
              <option key={year} value={year}>
                {year}/{year + 1}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {chip(t.calendar.allTypes, allOn, () => setActive(allKindsOn()))}
          {EVENT_CALENDAR_KINDS.map((kind) => (
            <span key={kind}>
              {chip(t.calendar.kinds[kind], active[kind], () => toggle(kind), KIND_STYLE[kind].dot)}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {YEARLY_CALENDAR_KINDS.map((kind) => (
            <span key={kind}>
              {chip(t.calendar.kinds[kind], active[kind], () => toggle(kind), KIND_STYLE[kind].dot)}
            </span>
          ))}
        </div>
      </div>

      {editor.toolbar}

      {mode === "list" ? (
        <CalendarEntryList
          entries={visible}
          fromWeekKey={showPast ? null : currentWeekKey}
          currentWeekKey={currentWeekKey}
          onShowEarlier={showPast ? null : () => setShowPast(true)}
          onRegister={setSelectedEvent}
          onSelect={openEntry}
          emptyMessage={activeCount === 0 ? t.calendar.noTypesSelected : t.calendar.nothingMatches}
        />
      ) : (
        <Suspense
          fallback={
            <div className="flex justify-center py-20" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          }
        >
          {mode === "month" ? (
            <CalendarView
              entries={visible}
              month={monthCursor}
              onMonthChange={setMonthCursor}
              onRegister={registerFor}
              editorActionsFor={editor.actionsFor}
            />
          ) : (
            <CalendarYearView
              entries={visible}
              schoolYear={schoolYear}
              onMonthPick={(picked) => {
                setMonthCursor(picked);
                changeMode("month");
              }}
            />
          )}
        </Suspense>
      )}

      {/* The feed is the one thing that turns this page into something you
          never have to open again, so it is said out loud at the bottom rather
          than hidden behind an icon. */}
      <aside className="flex flex-wrap items-center gap-4 rounded-2xl bg-emerald-50/70 px-5 py-4 dark:bg-emerald-950/20">
        <Bell className="h-5 w-5 shrink-0 text-accent dark:text-emerald-300" aria-hidden="true" />
        <div className="min-w-[14rem] flex-1">
          <p className="font-medium text-neutral-900 dark:text-neutral-50">{t.calendar.reminderTitle}</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t.calendar.reminderBody}</p>
        </div>
        <CalendarSubscribe triggerSize="default" triggerClassName="rounded-full bg-white dark:bg-neutral-900" />
      </aside>

      <Sheet
        open={sheetOpen && selected !== null}
        onOpenChange={(open) => {
          if (!open) setSheetOpen(false);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{selected?.title ?? t.calendar.detailEmpty}</SheetTitle>
          </SheetHeader>
          <CalendarEntryDetail
            entry={selected}
            onRegister={registerFor}
            actions={selected ? editor.actionsFor(selected) : null}
            attendeeCount={selected ? editor.attendeeCountFor(selected) : null}
          />
        </SheetContent>
      </Sheet>

      <EventRegistrationModal
        event={selectedEvent}
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
      />

      {editor.modals}
    </div>
  );
}
