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
 * The month as a grid, with the picked day's entries written out underneath.
 *
 * A cell has room for a dot and a few words, which is enough to see that
 * something is there but never enough to act on. Rather than cram the detail
 * in — or throw a panel over the grid you just navigated to — the day you pick
 * opens below it, where there is room for the time, the place and the signup.
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

  const weekdayNames = weeks[0]?.days.map((day) => formatDate(day.date, language, { weekday: "short" })) ?? [];
  const selectedEntries = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => step(-1)}
              aria-label={t.events.previousMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="font-heading text-lg font-semibold capitalize text-neutral-900 dark:text-neutral-50">
              {formatDate(new Date(month.year, month.month - 1, 1), language, {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => step(1)}
              aria-label={t.events.nextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={goToday}>
            {t.events.today}
          </Button>
        </div>

        <div className="overflow-x-auto border-t border-neutral-200 dark:border-neutral-800">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-7 border-b border-neutral-100 dark:border-neutral-900">
              {weekdayNames.map((name, index) => (
                <div
                  key={name + index}
                  className="px-3 py-3 text-sm font-medium capitalize text-neutral-500 dark:text-neutral-400"
                >
                  {name}
                </div>
              ))}
            </div>

            {weeks.map((week, weekIndex) => (
              <div
                key={`${isoWeekYear(week.days[0].date)}-${week.weekNumber}`}
                className={`grid grid-cols-7 ${
                  weekIndex > 0 ? "border-t border-neutral-100 dark:border-neutral-900" : ""
                }`}
              >
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
                      className={`min-h-[104px] px-2 py-2 transition-colors ${
                        isSelected
                          ? "bg-accent/10"
                          : day.inMonth
                            ? "hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                            : "bg-neutral-50/60 dark:bg-neutral-900/30"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDay(isSelected ? null : iso)}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-950"
                        aria-pressed={isSelected}
                      >
                        <span
                          className={`grid h-7 w-7 place-items-center rounded-full text-sm tabular-nums ${
                            isToday
                              ? "bg-accent font-semibold text-accent-foreground"
                              : day.inMonth
                                ? "text-neutral-800 dark:text-neutral-100"
                                : "text-neutral-300 dark:text-neutral-700"
                          }`}
                        >
                          {day.date.getDate()}
                        </span>
                      </button>

                      <div className="mt-0.5 flex flex-col gap-1">
                        {shown.map((entry) => (
                          <button
                            key={`${iso}-${entry.id}`}
                            type="button"
                            onClick={() => setSelectedDay(iso)}
                            title={entry.title}
                            className="flex items-baseline gap-1.5 text-left text-xs leading-snug text-neutral-700 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent dark:text-neutral-300 dark:hover:text-neutral-50"
                          >
                            <span
                              className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full ${
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
                            className="text-left text-xs font-medium text-neutral-500 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent dark:text-neutral-400 dark:hover:text-neutral-50"
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
        </div>
      </div>

      {selectedDay && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <h3 className="font-heading text-lg font-semibold capitalize text-neutral-900 dark:text-neutral-50">
            {formatDate(new Date(selectedDay), language, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h3>

          {selectedEntries.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              {t.calendar.noEventsThisWeek}
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {selectedEntries.map((entry) => {
                const style = KIND_STYLE[entry.kind];
                const time = entry.startTime
                  ? entry.endTime
                    ? `${entry.startTime} – ${entry.endTime}`
                    : entry.startTime
                  : t.calendar.allDay;

                return (
                  <article key={entry.id} className="space-y-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.tint} ${style.text}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
                      {t.calendar.kinds[entry.kind]}
                    </span>

                    <h4
                      className={`font-heading text-xl font-semibold text-neutral-900 dark:text-neutral-50 ${
                        entry.cancelled ? "line-through decoration-1" : ""
                      }`}
                    >
                      {entry.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
                      <span className="flex items-center gap-1.5">
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
                      <SafeHtml
                        html={entry.description}
                        className="text-sm text-neutral-700 dark:text-neutral-200"
                      />
                    )}

                    {entry.signup?.mode === "registration" && !entry.cancelled && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {entry.signup.maxAttendees !== null && (
                          <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                            {entry.signup.currentAttendees}/{entry.signup.maxAttendees} {t.events.attendees}
                          </span>
                        )}
                        <Button
                          size="sm"
                          className="rounded-full"
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
        </div>
      )}
    </div>
  );
}
