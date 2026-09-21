import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { CalendarEntry } from "@shared/calendar-entries";
import { compareSpanningEntries, isoWeekYear } from "@shared/calendar-entries";
import { toCalendarIsoDate, weeksOfMonth } from "@shared/yearly-calendar-display";
import SafeHtml from "@/components/safe-html";
import { StatusPill } from "@/components/site/controls";
import { Surface } from "@/components/site/section";

export type MonthCursor = { year: number; month: number };

interface CalendarViewProps {
  entries: CalendarEntry[];
  month: MonthCursor;
  onMonthChange: (month: MonthCursor) => void;
  onRegister: (entry: CalendarEntry) => void;
  editorActionsFor?: (entry: CalendarEntry) => ReactNode;
}

const MAX_PER_CELL = 3;

/**
 * The month as a grid, with the picked day written out underneath it.
 *
 * A cell has room for a dot and a few words, which is enough to see that
 * something is there but never enough to act on. Rather than cram the detail
 * in — or throw a panel over the grid you just navigated to — the day you pick
 * opens below it, where there is room for the time, the place and the signup
 * (guide §10B).
 *
 * Below 640px the grid drops its event labels and shows dots only, with the
 * agenda under the selected day doing the reading. That is the guide's
 * recommendation for narrow screens, and it is what removes the horizontal
 * scroll the old 680px-wide grid forced on a phone.
 */
export default function CalendarView({
  entries,
  month,
  onMonthChange,
  onRegister,
  editorActionsFor,
}: CalendarViewProps) {
  const { language, t } = useLanguage();
  const todayIso = toCalendarIsoDate(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const weeks = useMemo(() => weeksOfMonth(month.year, month.month), [month.year, month.month]);

  // Week-spanning entries have no day of their own, so they sit on the Monday
  // of the week they cover — the grid has no other honest place for them.
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    const push = (iso: string, entry: CalendarEntry) => {
      const forDay = map.get(iso);
      if (forDay) forDay.push(entry);
      else map.set(iso, [entry]);
    };

    for (const entry of entries) {
      if (entry.date) push(entry.date, entry);
    }
    for (const week of weeks) {
      const monday = week.days[0];
      const weekYear = isoWeekYear(monday.date);
      const spanning = entries
        .filter(
          (entry) =>
            !entry.date &&
            entry.weekYear === weekYear &&
            week.weekNumber >= entry.week &&
            week.weekNumber <= entry.weekEnd,
        )
        .sort(compareSpanningEntries);
      for (const entry of spanning) push(toCalendarIsoDate(monday.date), entry);
    }
    return map;
  }, [entries, weeks]);

  const step = (direction: -1 | 1) => {
    setSelectedDay(null);
    setExpanded(new Set());
    const next = new Date(month.year, month.month - 1 + direction, 1);
    onMonthChange({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  const goToday = () => {
    const now = new Date();
    setExpanded(new Set());
    onMonthChange({ year: now.getFullYear(), month: now.getMonth() + 1 });
    setSelectedDay(todayIso);
  };

  const weekdayNames =
    weeks[0]?.days.map((day) => ({
      long: formatDate(day.date, language, { weekday: "long" }),
      short: formatDate(day.date, language, { weekday: "short" }),
      narrow: formatDate(day.date, language, { weekday: "narrow" }),
    })) ?? [];
  const selectedEntries = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden">
        {/* The month nav wraps on a narrow phone rather than squeezing
            "September 2026" into an ellipsis next to two chevrons. */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-pill"
              onClick={() => step(-1)}
              aria-label={t.events.previousMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="min-w-0 flex-1 text-h4 font-bold capitalize text-ink">
              {formatDate(new Date(month.year, month.month - 1, 1), language, {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-pill"
              onClick={() => step(1)}
              aria-label={t.events.nextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="rounded-pill" onClick={goToday}>
            {t.events.today}
          </Button>
        </div>

        <div className="border-t border-hairline">
          {/* Week number in its own narrow rail from tablet up: the whole
              kindergarten year is spoken about in week numbers, so the grid
              should let you find "uke 38" without counting. */}
          <div className="grid grid-cols-7 border-b border-hairline bg-sand sm:grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]">
            <div className="hidden items-center justify-center py-2.5 text-micro font-semibold uppercase tracking-[0.1em] text-subtle sm:flex">
              {t.calendar.week}
            </div>
            {weekdayNames.map((name, index) => (
              <div
                key={index}
                className="py-2.5 text-center text-micro font-semibold uppercase tracking-[0.06em] text-subtle sm:px-2 sm:text-left sm:text-small sm:normal-case sm:tracking-normal"
              >
                <span className="sm:hidden" aria-hidden="true">
                  {name.narrow}
                </span>
                <span className="hidden capitalize sm:inline" aria-hidden="true">
                  {name.short}
                </span>
                <span className="sr-only">{name.long}</span>
              </div>
            ))}
          </div>

          {weeks.map((week, weekIndex) => (
            <div
              key={`${isoWeekYear(week.days[0].date)}-${week.weekNumber}`}
              className={`grid grid-cols-7 sm:grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] ${
                weekIndex > 0 ? "border-t border-hairline" : ""
              }`}
            >
              <div className="hidden items-start justify-center border-r border-hairline bg-sand pt-2 text-micro font-semibold tabular-nums text-subtle sm:flex">
                {week.weekNumber}
              </div>

              {week.days.map((day) => {
                const iso = toCalendarIsoDate(day.date);
                const dayEntries = byDate.get(iso) ?? [];
                const isToday = iso === todayIso;
                const isSelected = iso === selectedDay;
                const open = expanded.has(iso);
                const shown = open ? dayEntries : dayEntries.slice(0, MAX_PER_CELL);

                return (
                  <div
                    key={iso}
                    className={`min-h-[60px] px-1 py-1.5 transition-colors duration-micro ease-guide sm:min-h-[112px] sm:px-2 sm:py-2 ${
                      isSelected
                        ? "bg-green-50"
                        : day.inMonth
                          ? "hover:bg-green-50/50"
                          : "bg-sand/70"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDay(isSelected ? null : iso)}
                      aria-pressed={isSelected}
                      className="mx-auto block sm:mx-0"
                    >
                      <span className="sr-only">
                        {formatDate(day.date, language, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                        {dayEntries.length > 0 ? ` — ${dayEntries.length}` : ""}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`grid h-8 w-8 place-items-center rounded-pill text-small tabular-nums transition-colors duration-micro ease-guide ${
                          isToday
                            ? "bg-brand font-bold text-primary-foreground"
                            : isSelected
                              ? "font-bold text-brand ring-2 ring-brand/40"
                              : day.inMonth
                                ? "font-semibold text-ink"
                                : "text-subtle/60"
                        }`}
                      >
                        {day.date.getDate()}
                      </span>
                    </button>

                    {/* Phone: dots only. The agenda under the grid does the
                        reading, which is what keeps the month usable at
                        375px without sideways scrolling (guide §15). */}
                    {dayEntries.length > 0 && (
                      <div
                        className="mt-1 flex justify-center gap-0.5 sm:hidden"
                        aria-hidden="true"
                      >
                        {dayEntries.slice(0, MAX_PER_CELL).map((entry) => (
                          <span
                            key={`dot-${entry.id}`}
                            className={`h-1.5 w-1.5 rounded-pill ${KIND_STYLE[entry.kind].dot}`}
                          />
                        ))}
                      </div>
                    )}

                    <div className="mt-1 hidden flex-col gap-1 sm:flex">
                      {shown.map((entry) => (
                        <button
                          key={`${iso}-${entry.id}`}
                          type="button"
                          onClick={() => setSelectedDay(iso)}
                          title={entry.title}
                          className="flex items-baseline gap-1.5 rounded-sm text-left text-micro leading-snug text-copy hover:text-brand"
                        >
                          <span
                            className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-pill ${
                              KIND_STYLE[entry.kind].dot
                            }`}
                            aria-hidden="true"
                          />
                          <span
                            className={`truncate ${entry.cancelled ? "line-through decoration-1" : ""}`}
                          >
                            {entry.title}
                          </span>
                        </button>
                      ))}
                      {!open && dayEntries.length > MAX_PER_CELL && (
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => new Set(prev).add(iso))}
                          className="text-left text-micro font-semibold text-subtle hover:text-brand"
                        >
                          +{dayEntries.length - MAX_PER_CELL} {t.events.more}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Surface>

      {selectedDay && (
        <Surface className="p-5 sm:p-6" as="section" aria-live="polite">
          <h3 className="text-h4 font-bold capitalize text-ink">
            {formatDate(new Date(selectedDay), language, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h3>

          {selectedEntries.length === 0 ? (
            <p className="mt-3 text-small text-subtle">{t.calendar.noEventsThisDay}</p>
          ) : (
            <div className="mt-5 divide-y divide-hairline">
              {selectedEntries.map((entry) => {
                const style = KIND_STYLE[entry.kind];
                const time = entry.startTime
                  ? entry.endTime
                    ? `${entry.startTime} – ${entry.endTime}`
                    : entry.startTime
                  : t.calendar.allDay;

                return (
                  <article key={entry.id} className="space-y-2 py-5 first:pt-0 last:pb-0">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-semibold ${style.tint} ${style.text}`}
                    >
                      <span className={`h-2 w-2 rounded-pill ${style.dot}`} aria-hidden="true" />
                      {t.calendar.kinds[entry.kind]}
                    </span>

                    <h4
                      className={`text-h3 font-bold tracking-tight text-ink ${
                        entry.cancelled ? "line-through decoration-1" : ""
                      }`}
                    >
                      {entry.title}
                    </h4>
                    {entry.cancelled && (
                      <StatusPill tone="warn">{t.events.cancelled2}</StatusPill>
                    )}

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-small text-subtle">
                      <span className="flex items-center gap-1.5 tabular-nums">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        {time}
                      </span>
                      {entry.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" aria-hidden="true" />
                          {entry.location}
                        </span>
                      )}
                    </div>

                    {entry.description && (
                      <SafeHtml html={entry.description} className="measure text-small text-copy" />
                    )}

                    {entry.signup?.mode === "registration" && !entry.cancelled && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {entry.signup.maxAttendees !== null && (
                          <span className="text-small tabular-nums text-subtle">
                            {entry.signup.currentAttendees}/{entry.signup.maxAttendees}{" "}
                            {t.events.attendees}
                          </span>
                        )}
                        <Button
                          size="sm"
                          className="rounded-pill"
                          disabled={!entry.signup.isOpen}
                          onClick={() => onRegister(entry)}
                        >
                          {entry.signup.isFull
                            ? t.events.full
                            : entry.signup.deadlinePassed
                              ? t.events.registrationClosed
                              : t.events.register}
                        </Button>
                      </div>
                    )}

                    {editorActionsFor?.(entry)}
                  </article>
                );
              })}
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
