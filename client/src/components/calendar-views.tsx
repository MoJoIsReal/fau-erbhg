import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, CalendarRange, List, Loader2, SlidersHorizontal } from "lucide-react";
import type { CalendarEntry, CalendarEntryKind } from "@shared/calendar-entries";
import {
  CALENDAR_ENTRY_KINDS,
  CALENDAR_DISPLAY_KINDS,
  calendarWeekKey,
  isoWeekYear,
} from "@shared/calendar-entries";
import { isoWeek } from "@shared/yearly-calendar-display";
import { getKindergartenSchoolYear } from "@/lib/kindergarten-year";
import { useCalendarEntries } from "@/hooks/useCalendarEntries";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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
import PageHero from "@/components/site/page-hero";
import { FilterChip, SegmentedControl } from "@/components/site/controls";
import { InfoBanner } from "@/components/site/banners";
import { EmptyState } from "@/components/site/section";
import { ILLUSTRATION_CALENDAR } from "@/components/site/illustrations";

// The grids are only paid for when someone switches to them.
const CalendarView = lazy(() => import("@/components/calendar-view"));
const CalendarYearView = lazy(() => import("@/components/calendar-year-view"));

type CalendarViewMode = "list" | "month" | "year";
export type MonthCursor = { year: number; month: number };

const VIEW_MODES: CalendarViewMode[] = ["list", "month", "year"];
const STORAGE_KEY = "fau-calendar-view-groups";

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
 * The three views are one system rather than three components that happen to
 * share a page — same hero, same filter row, same category colours, same
 * detail panel. What changes between them is density, not language: the list
 * answers "what is happening in my week", the month grid "where in the month
 * does this fall", and the year "when is it busy".
 *
 * The control strip follows the guide's §11 order: the segmented view switch
 * first, the kindergarten year beside it, the public filters under both, and
 * the editor's own toolbar below that on a sand surface of its own — never
 * interleaved with the filters a parent uses.
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
  // Ten categories is a long row on a phone. They collapse behind one button
  // there and stay open from tablet up, rather than wrapping into four lines
  // above the calendar (guide §11).
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const visible = useMemo(() => entries.filter((entry) => active[entry.displayKind]), [entries, active]);
  const activeCount = CALENDAR_DISPLAY_KINDS.filter((kind) => active[kind]).length;
  const allOn = activeCount === CALENDAR_DISPLAY_KINDS.length;

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

  useEffect(() => {
    setSelected((current) => current ? entries.find((entry) => entry.id === current.id) ?? null : null);
  }, [entries]);

  const editor = useCalendarEditor({ schoolYear });
  const schoolYearOptions = [thisSchoolYear - 1, thisSchoolYear, thisSchoolYear + 1];

  // Month and year are tablet-and-up views. On a phone a month grid is a worse
  // version of the list — a wall of dots you then have to tap to read a single
  // line — so below the guide's mobile breakpoint the switch is not offered and
  // the list is simply what the calendar is. `mode` itself is left untouched,
  // so someone who chose "Måned" on a laptop still finds it there.
  const compact = !useMediaQuery("(min-width: 640px)");
  const view = compact ? "list" : mode;

  // The kindergarten-year picker only changes the year view and the editor's
  // export scope; it does nothing to the list. On a phone, where the list is
  // the only public view, it would be a control that appears to do nothing.
  const showSchoolYear = !compact || editor.toolbar !== null;

  const modes = [
    {
      id: "list" as const,
      label: t.calendar.listView,
      icon: <List className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: "month" as const,
      label: t.calendar.monthView,
      icon: <CalendarDays className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: "year" as const,
      label: t.calendar.yearView,
      icon: <CalendarRange className="h-4 w-4" aria-hidden="true" />,
    },
  ];

  const heading =
    view === "month"
      ? formatDate(new Date(monthCursor.year, monthCursor.month - 1, 1), language, {
          month: "long",
          year: "numeric",
        })
      : view === "year"
        ? `${t.calendar.yearHeading} ${schoolYear}/${schoolYear + 1}`
        : t.calendar.listHeading;

  const intro =
    view === "month"
      ? t.calendar.monthIntro
      : view === "year"
        ? t.calendar.yearIntro
        : t.calendar.listIntro;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <span className="sr-only">{t.common.loading}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        isError
        icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
        title={t.calendar.loadFailed}
      />
    );
  }

  return (
    // The calendar is the site's one working surface, so it takes the wide
    // container rather than the reading one (guide v1.1 §24, "Kalender").
    <div className="bleed-wide space-y-7">
      <PageHero
        layout="editorial"
        tone="green"
        priority
        eyebrow={t.calendar.title}
        title={<span className={view === "month" ? "capitalize" : undefined}>{heading}</span>}
        lead={intro}
        hand={t.calendar.tagline}
        illustration={{ art: ILLUSTRATION_CALENDAR, alt: "" }}
      />

      {/* Control strip. Sticky is deliberately not used here: the guide warns
          against stacking sticky elements, and the week headers inside the
          list are the thing worth keeping on screen. */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!compact && (
            <SegmentedControl
              options={modes}
              value={mode}
              onChange={changeMode}
              label={t.calendar.viewLabel}
            />
          )}

          {showSchoolYear && (
            <label className="flex items-center gap-2 text-small text-subtle">
              {t.yearlyCalendar.schoolYearLabel}
              <select
                value={schoolYear}
                onChange={(event) => setSchoolYear(Number(event.target.value))}
                className="h-11 rounded-token border border-hairline bg-surface px-3 text-small font-semibold text-ink"
              >
                {schoolYearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}/{year + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div>
          {/* Phone: one button that also reports how many of the ten types are
              showing, so the filter state is legible without opening it. */}
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-hairline bg-surface px-4 text-small font-semibold text-copy sm:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {t.calendar.filtersLabel}
            {!allOn && (
              <span className="rounded-pill bg-green-50 px-2 py-0.5 text-micro tabular-nums text-brand">
                {activeCount}/{CALENDAR_ENTRY_KINDS.length}
              </span>
            )}
          </button>

          <div
            className={`mt-3 space-y-2 sm:mt-0 sm:block ${filtersOpen ? "block" : "hidden"}`}
            role="group"
            aria-label={t.calendar.allTypes}
          >
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                label={t.calendar.allTypes}
                pressed={allOn}
                onClick={() => setActive(allKindsOn())}
              />
              {CALENDAR_DISPLAY_KINDS.map((kind) => (
                <FilterChip
                  key={kind}
                  label={t.entryEditor.categories[kind]}
                  pressed={active[kind]}
                  onClick={() => toggle(kind)}
                  dotClass={KIND_STYLE[kind].dot}
                />
              ))}
            </div>

          </div>
        </div>
      </div>

      {editor.toolbar}

      {view === "list" ? (
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
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
            </div>
          }
        >
          {view === "month" ? (
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
      <InfoBanner
        tone="calm"
        icon={<Bell className="h-5 w-5" aria-hidden="true" />}
        title={t.calendar.reminderTitle}
        action={
          <CalendarSubscribe triggerSize="default" triggerClassName="rounded-pill bg-surface" />
        }
      >
        {t.calendar.reminderBody}
      </InfoBanner>

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
