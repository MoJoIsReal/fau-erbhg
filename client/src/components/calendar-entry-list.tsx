import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CalendarEntry, CalendarEntryKind } from "@shared/calendar-entries";
import {
  CALENDAR_ENTRY_KINDS,
  EVENT_CALENDAR_KINDS,
  YEARLY_CALENDAR_KINDS,
  calendarWeekKey,
  groupCalendarEntriesByWeek,
  isoWeekRange,
  isoWeekYear,
} from "@shared/calendar-entries";
import { isoWeek } from "@shared/yearly-calendar-display";
import { useCalendarEntries } from "@/hooks/useCalendarEntries";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate, type Language } from "@/lib/i18n";
import type { Event } from "@shared/schema";
import EventRegistrationModal from "@/components/event-registration-modal";
import SafeHtml from "@/components/safe-html";

// One colour per kind, as Tailwind classes rather than inline styles so both
// themes come from the same place the rest of the site uses. `border` is the
// stripe down the left of a row, `text` the badge, `chip` the filter pill.
const KIND_STYLE: Record<CalendarEntryKind, { border: string; text: string; chip: string }> = {
  arrangement: {
    border: "border-l-orange-600 dark:border-l-orange-400",
    text: "text-orange-700 dark:text-orange-300",
    chip: "border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  },
  mote: {
    border: "border-l-cyan-700 dark:border-l-cyan-400",
    text: "text-cyan-800 dark:text-cyan-300",
    chip: "border-cyan-600 bg-cyan-50 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200",
  },
  dugnad: {
    border: "border-l-emerald-700 dark:border-l-emerald-400",
    text: "text-emerald-800 dark:text-emerald-300",
    chip: "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  foto: {
    border: "border-l-violet-600 dark:border-l-violet-400",
    text: "text-violet-700 dark:text-violet-300",
    chip: "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  },
  internt: {
    border: "border-l-slate-500 dark:border-l-slate-400",
    text: "text-slate-700 dark:text-slate-300",
    chip: "border-slate-400 bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200",
  },
  bhgdag: {
    border: "border-l-blue-600 dark:border-l-blue-400",
    text: "text-blue-700 dark:text-blue-300",
    chip: "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  varmmat: {
    border: "border-l-amber-600 dark:border-l-amber-400",
    text: "text-amber-700 dark:text-amber-300",
    chip: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  },
  temauke: {
    border: "border-l-fuchsia-700 dark:border-l-fuchsia-400",
    text: "text-fuchsia-800 dark:text-fuchsia-300",
    chip: "border-fuchsia-600 bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-200",
  },
  stengt: {
    border: "border-l-red-700 dark:border-l-red-400",
    text: "text-red-700 dark:text-red-300",
    chip: "border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  },
  beskjed: {
    border: "border-l-stone-500 dark:border-l-stone-400",
    text: "text-stone-700 dark:text-stone-300",
    chip: "border-stone-400 bg-stone-100 text-stone-800 dark:bg-stone-800/60 dark:text-stone-200",
  },
};

const CHIP_OFF =
  "border-neutral-300 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400";

function allKindsOn(): Record<CalendarEntryKind, boolean> {
  return CALENDAR_ENTRY_KINDS.reduce(
    (acc, kind) => ({ ...acc, [kind]: true }),
    {} as Record<CalendarEntryKind, boolean>,
  );
}

// formatDate already owns the locale mapping, so the date margin gets its
// weekday and month from there rather than reaching for a locale id here.
function weekdayAndDay(date: Date, language: Language) {
  return {
    weekday: formatDate(date, language, { weekday: "short" }),
    day: date.getDate(),
    month: formatDate(date, language, { month: "short" }),
  };
}

function SignupSide({ entry, onRegister }: { entry: CalendarEntry; onRegister: (event: Event) => void }) {
  const { t } = useLanguage();
  const signup = entry.signup;

  if (entry.cancelled) {
    return <span className="text-sm font-semibold text-red-600 dark:text-red-300">{t.events.cancelled2}</span>;
  }
  if (!signup) return null;

  if (signup.mode === "internal") {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">{t.events.internalEvent}</span>;
  }
  if (signup.mode === "vigilo") {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">{t.events.registerVigilo}</span>;
  }
  if (signup.mode === "none") {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">{t.events.noSignupRequired}</span>;
  }

  return (
    <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
      {signup.maxAttendees !== null && (
        <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
          {signup.currentAttendees}/{signup.maxAttendees} {t.events.attendees}
        </span>
      )}
      {signup.isFull ? (
        <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">{t.events.full}</span>
      ) : signup.deadlinePassed ? (
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{t.events.registrationClosed}</span>
      ) : (
        <Button size="sm" onClick={() => entry.event && onRegister(entry.event)}>
          {t.events.register}
        </Button>
      )}
    </div>
  );
}

function DatedRow({ entry, onRegister }: { entry: CalendarEntry; onRegister: (event: Event) => void }) {
  const { language, t } = useLanguage();
  const style = KIND_STYLE[entry.kind];
  const date = new Date(entry.date as string);
  const { weekday, day, month } = weekdayAndDay(date, language);
  const time = entry.startTime
    ? entry.endTime
      ? `${entry.startTime}–${entry.endTime}`
      : entry.startTime
    : "";
  const meta = [time, entry.location].filter(Boolean).join(" · ");

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-l-4 px-3 py-3 sm:flex-nowrap sm:px-4 ${
        style.border
      } ${entry.cancelled ? "opacity-70" : ""}`}
    >
      <div className="w-11 shrink-0 text-center leading-tight">
        <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400">{weekday}</div>
        <div className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-50">{day}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{month}</div>
      </div>

      <div className="min-w-[12rem] flex-1 basis-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-semibold text-neutral-900 dark:text-neutral-50 ${
              entry.cancelled ? "line-through" : ""
            }`}
          >
            {entry.title}
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
            {t.calendar.kinds[entry.kind]}
          </span>
        </div>
        {meta && <div className="text-sm text-neutral-600 dark:text-neutral-300">{meta}</div>}
        {entry.description && (
          <SafeHtml
            html={entry.description}
            className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400"
          />
        )}
      </div>

      {(entry.signup || entry.cancelled) && (
        <div className="w-full shrink-0 pl-[3.75rem] sm:w-auto sm:pl-0 sm:text-right">
          <SignupSide entry={entry} onRegister={onRegister} />
        </div>
      )}
    </li>
  );
}

function SpanningRow({ entry }: { entry: CalendarEntry }) {
  const { t } = useLanguage();
  const style = KIND_STYLE[entry.kind];
  const span =
    entry.weekEnd > entry.week
      ? `${t.calendar.weeksSpan} ${entry.week}–${entry.weekEnd}`
      : t.calendar.allWeek;

  return (
    <li className={`flex items-center gap-3 rounded-md border border-l-4 px-3 py-2 ${style.chip} ${style.border}`}>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{t.calendar.kinds[entry.kind]}:</span> {entry.title}
      </span>
      <span className="shrink-0 text-xs tabular-nums opacity-80">{span}</span>
    </li>
  );
}

/**
 * The calendar as one week-grouped list. What lasts a whole week (varmmat,
 * temauke, beskjed) sits in a band under the week heading; what happens on a
 * day sits below it with the date in the margin — which is what lets the two
 * former tabs share a single list without either one being squeezed into the
 * other's shape.
 */
export default function CalendarEntryList() {
  const { language, t } = useLanguage();
  const { entries, isLoading, isError } = useCalendarEntries();
  const [active, setActive] = useState<Record<CalendarEntryKind, boolean>>(allKindsOn);
  const [showPast, setShowPast] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const today = new Date();
  const currentWeekKey = calendarWeekKey(isoWeekYear(today), isoWeek(today));

  const visible = useMemo(() => entries.filter((entry) => active[entry.kind]), [entries, active]);
  const groups = useMemo(
    () => groupCalendarEntriesByWeek(visible, { fromWeekKey: showPast ? null : currentWeekKey }),
    [visible, showPast, currentWeekKey],
  );

  const activeCount = CALENDAR_ENTRY_KINDS.filter((kind) => active[kind]).length;
  const toggle = (kind: CalendarEntryKind) =>
    setActive((prev) => ({ ...prev, [kind]: !prev[kind] }));

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
        {renderChips(EVENT_CALENDAR_KINDS, t.calendar.filterSignup)}
        {renderChips(YEARLY_CALENDAR_KINDS, t.calendar.filterKindergarten)}
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

      {!showPast && (
        <Button variant="outline" size="sm" onClick={() => setShowPast(true)}>
          {t.calendar.showEarlier}
        </Button>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-neutral-600 dark:text-neutral-300">
            {activeCount === 0 ? t.calendar.noTypesSelected : t.calendar.nothingMatches}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-neutral-200 p-0 dark:divide-neutral-800">
            {groups.map((group) => {
              const { start, end } = isoWeekRange(group.weekYear, group.week);
              const range = `${formatDate(start, language, { day: "numeric", month: "short" })} – ${formatDate(
                end,
                language,
                { day: "numeric", month: "short" },
              )}`;
              return (
                <section key={group.weekKey} className="py-2">
                  <h3 className="flex flex-wrap items-baseline gap-2 px-3 pb-1 pt-2 sm:px-4">
                    <span className="text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                      {t.calendar.week} {group.week}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{range}</span>
                    {group.weekKey === currentWeekKey && (
                      <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                        {t.calendar.thisWeek}
                      </span>
                    )}
                  </h3>

                  {group.spanning.length > 0 && (
                    <ul className="flex flex-col gap-1 px-3 pb-1 sm:px-4">
                      {group.spanning.map((entry) => (
                        <SpanningRow key={entry.id} entry={entry} />
                      ))}
                    </ul>
                  )}

                  {group.dated.length > 0 && (
                    <ul className="flex flex-col">
                      {group.dated.map((entry) => (
                        <DatedRow key={entry.id} entry={entry} onRegister={setSelectedEvent} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </CardContent>
        </Card>
      )}

      {groups.length > 0 && (
        <p className="pb-2 text-center text-sm text-neutral-500 dark:text-neutral-400">{t.calendar.endOfList}</p>
      )}

      <EventRegistrationModal
        event={selectedEvent}
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
