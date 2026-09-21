import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { List, Loader2, CalendarDays, CalendarRange } from "lucide-react";
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
import { getKindergartenSchoolYear } from "@/lib/kindergarten-year";
import { useCalendarEntries } from "@/hooks/useCalendarEntries";
import { useLanguage } from "@/contexts/LanguageContext";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { Event } from "@shared/schema";
import CalendarEntryList from "@/components/calendar-entry-list";
import CalendarEntryDetail from "@/components/calendar-entry-detail";
import { useCalendarEditor } from "@/components/calendar-editor-tools";
import EventRegistrationModal from "@/components/event-registration-modal";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// The grids are only paid for when someone switches to them.
const CalendarView = lazy(() => import("@/components/calendar-view"));
const CalendarYearView = lazy(() => import("@/components/calendar-year-view"));

type CalendarViewMode = "list" | "month" | "year";

const VIEW_MODES: CalendarViewMode[] = ["list", "month", "year"];
const STORAGE_KEY = "fau-calendar-view";

// Which view and which filters someone last used is a convenience, not data:
// it lives in this browser only, and a blocked or cleared store just means
// everything is on and the list is showing.
type StoredPreferences = {
  mode?: CalendarViewMode;
  off?: CalendarEntryKind[];
};

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
  for (const kind of CALENDAR_ENTRY_KINDS) {
    if (off.has(kind)) state[kind] = false;
  }
  return state;
}

function initialMode(): CalendarViewMode {
  const stored = readPreferences().mode;
  return stored && VIEW_MODES.includes(stored) ? stored : "list";
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
  const [active, setActive] = useState<Record<CalendarEntryKind, boolean>>(initialActive);
  const [mode, setMode] = useState<CalendarViewMode>(initialMode);
  const [showPast, setShowPast] = useState(false);
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Wide enough to put the detail beside the list instead of over it. Below
  // this it slides in as a sheet, which is the same content either way.
  const canDock = useMediaQuery("(min-width: 1024px)");

  const today = new Date();
  const currentWeekKey = calendarWeekKey(isoWeekYear(today), isoWeek(today));
  const [schoolYear, setSchoolYear] = useState(() => getKindergartenSchoolYear(new Date()));

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

  const toggle = (kind: CalendarEntryKind) => setActive((prev) => ({ ...prev, [kind]: !prev[kind] }));

  // One year back and one forward covers what the entries can actually hold:
  // the hook fetches this school year and the next.
  const thisSchoolYear = getKindergartenSchoolYear(new Date());
  const schoolYearOptions = [thisSchoolYear - 1, thisSchoolYear, thisSchoolYear + 1];

  const openEntry = (entry: CalendarEntry) => setSelected(entry);
  const registerFor = (entry: CalendarEntry) => {
    if (entry.event) setSelectedEvent(entry.event);
  };

  // The docked panel is always showing something, so it falls back to the
  // next thing that actually happens on a day rather than opening on a week
  // of hot meals.
  const docked = useMemo(() => {
    if (selected && active[selected.kind]) return selected;
    const upcoming = visible.filter((entry) => entry.weekKey >= currentWeekKey);
    return upcoming.find((entry) => entry.date) ?? upcoming[0] ?? visible[0] ?? null;
  }, [selected, visible, active, currentWeekKey]);

  const editor = useCalendarEditor({ schoolYear });

  const detail = (
    <CalendarEntryDetail
      entry={docked}
      onRegister={registerFor}
      actions={docked ? editor.actionsFor(docked) : null}
      attendeeCount={docked ? editor.attendeeCountFor(docked) : null}
    />
  );

  // The chip carries its kind as a dot, not as a fill. Ten filled pills in two
  // rows read as a colour chart; ten dots read as a legend.
  const renderChips = (kinds: readonly CalendarEntryKind[], label: string) => (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="mr-1 text-[11px] uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
        {label}
      </span>
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => toggle(kind)}
          aria-pressed={active[kind]}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 ${
            active[kind]
              ? "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              : "border-transparent bg-transparent text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
          }`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              active[kind] ? KIND_STYLE[kind].dot : "bg-neutral-300 dark:bg-neutral-700"
            }`}
            aria-hidden="true"
          />
          {t.calendar.kinds[kind]}
        </button>
      ))}
    </div>
  );

  const modes: { id: CalendarViewMode; label: string; icon: typeof List }[] = [
    { id: "list", label: t.calendar.listView, icon: List },
    { id: "month", label: t.calendar.monthView, icon: CalendarDays },
    { id: "year", label: t.calendar.yearView, icon: CalendarRange },
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
      <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex gap-0.5 rounded-full bg-neutral-100 p-1 dark:bg-neutral-900"
            role="group"
            aria-label={t.calendar.viewLabel}
          >
            {modes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  mode === id
                    ? "bg-neutral-900 font-medium text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            {(mode === "year" || editor.isEditor) && (
              <label className="flex items-center gap-2">
                <span>{t.yearlyCalendar.schoolYearLabel}</span>
                <select
                  value={schoolYear}
                  onChange={(event) => setSchoolYear(Number(event.target.value))}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  {schoolYearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}/{year + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
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

      {editor.toolbar}

      {/* The cutoff is the list's alone. The month grid and the year strip
          always show a whole period, so hiding past weeks there would only
          punch holes in them. */}
      {mode === "list" ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <CalendarEntryList
            entries={visible}
            fromWeekKey={showPast ? null : currentWeekKey}
            currentWeekKey={currentWeekKey}
            onShowEarlier={showPast ? null : () => setShowPast(true)}
            onRegister={setSelectedEvent}
            onSelect={openEntry}
            selectedId={docked?.id ?? null}
            emptyMessage={activeCount === 0 ? t.calendar.noTypesSelected : t.calendar.nothingMatches}
          />
          {canDock && (
            <aside className="sticky top-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
              {detail}
            </aside>
          )}
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="flex justify-center py-16" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }
        >
          {mode === "month" ? (
            <CalendarView entries={visible} onEntryClick={openEntry} />
          ) : (
            <CalendarYearView
              entries={visible}
              schoolYear={schoolYear}
              onEntryClick={openEntry}
            />
          )}
        </Suspense>
      )}

      {/* Below the docking width — and from the month and year views, which
          have no room to dock — the same detail slides in over the calendar. */}
      <Sheet
        open={selected !== null && (!canDock || mode !== "list")}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
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
