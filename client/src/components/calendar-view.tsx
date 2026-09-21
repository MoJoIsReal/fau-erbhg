import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { CalendarEntry } from "@shared/calendar-entries";
import { compareSpanningEntries, isoWeekYear } from "@shared/calendar-entries";
import { toCalendarIsoDate, weeksOfMonth } from "@shared/yearly-calendar-display";

interface CalendarViewProps {
  entries: CalendarEntry[];
  onEntryClick: (entry: CalendarEntry) => void;
}

// Two entries per cell keeps a busy day from stretching the whole row; the
// rest are counted, and the week list is there for anyone who wants them all.
const MAX_ENTRIES_PER_DAY = 2;

/**
 * The month as a grid, with a wide week column down the left.
 *
 * That column is what lets one grid carry both calendars: everything that
 * lasts a whole week (ukens varmmat, temauker, beskjeder) lives in the rail,
 * and everything tied to a date lives in the day cells. Neither has to be
 * squeezed into the other's shape — a week of hot meals was never a Monday.
 */
export default function CalendarView({ entries, onEntryClick }: CalendarViewProps) {
  const { language, t } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const weeks = useMemo(() => weeksOfMonth(year, month), [year, month]);

  // Dated entries by ISO date, week-spanning ones kept apart for the rail.
  const { byDate, spanning } = useMemo(() => {
    const dated = new Map<string, CalendarEntry[]>();
    const weekly: CalendarEntry[] = [];
    for (const entry of entries) {
      if (entry.date) {
        const forDay = dated.get(entry.date);
        if (forDay) forDay.push(entry);
        else dated.set(entry.date, [entry]);
      } else {
        weekly.push(entry);
      }
    }
    return { byDate: dated, spanning: weekly };
  }, [entries]);

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentDate((prev) => {
      // Anchor on the 1st: stepping from the 31st would otherwise skip a
      // short month entirely.
      const next = new Date(prev.getFullYear(), prev.getMonth(), 1);
      next.setMonth(next.getMonth() + (direction === "prev" ? -1 : 1));
      return next;
    });
  };

  const todayIso = toCalendarIsoDate(new Date());
  const monthYearText = formatDate(new Date(year, month - 1, 1), language, {
    month: "long",
    year: "numeric",
  });

  // Weekday headers come from the first week's own days, so the locale is
  // formatDate's business rather than a hardcoded list per language.
  const weekdayNames = weeks[0]?.days.map((day) => formatDate(day.date, language, { weekday: "short" })) ?? [];

  // Same ordering as the week list's band — varmmat first — so the rail and
  // the list do not disagree about what the week leads with.
  const railEntriesFor = (weekNumber: number, weekYear: number) =>
    spanning
      .filter(
        (entry) =>
          entry.weekYear === weekYear && weekNumber >= entry.week && weekNumber <= entry.weekEnd,
      )
      .sort(compareSpanningEntries);

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateMonth("prev")}
            aria-label={t.events.previousMonth}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="flex items-center space-x-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            <CalendarIcon className="h-5 w-5" aria-hidden="true" />
            <span>{monthYearText}</span>
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateMonth("next")}
            aria-label={t.events.nextMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* The grid needs its eight columns to stay readable, so on a phone it
            scrolls sideways inside its own container rather than collapsing. */}
        <div className="overflow-x-auto">
          <div className="min-w-[660px] overflow-hidden rounded-lg border dark:border-neutral-800">
            <div className="grid grid-cols-[7rem_repeat(7,minmax(0,1fr))] bg-neutral-100 dark:bg-neutral-900">
              <div className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                {t.calendar.week}
              </div>
              {weekdayNames.map((name, index) => (
                <div
                  key={name + index}
                  className="border-l px-2 py-2 text-xs font-medium uppercase tracking-wide text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
                >
                  {name}
                </div>
              ))}
            </div>

            {weeks.map((week) => {
              const weekYear = isoWeekYear(week.days[0].date);
              const railEntries = railEntriesFor(week.weekNumber, weekYear);

              return (
                <div
                  key={`${weekYear}-${week.weekNumber}`}
                  className="grid grid-cols-[7rem_repeat(7,minmax(0,1fr))] border-t dark:border-neutral-800"
                >
                  <div className="flex flex-col gap-1 bg-neutral-50 px-2 py-2 dark:bg-neutral-900/60">
                    <span className="text-xs font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
                      {t.calendar.week} {week.weekNumber}
                    </span>
                    {railEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onEntryClick(entry)}
                        className={`border-l-4 pl-1.5 text-left text-[11px] leading-tight text-neutral-700 dark:text-neutral-200 ${
                          KIND_STYLE[entry.kind].border
                        }`}
                      >
                        <span
                          className={`block text-[10px] font-semibold uppercase tracking-wide ${
                            KIND_STYLE[entry.kind].text
                          }`}
                        >
                          {t.calendar.kinds[entry.kind]}
                        </span>
                        {entry.title}
                      </button>
                    ))}
                  </div>

                  {week.days.map((day) => {
                    const iso = toCalendarIsoDate(day.date);
                    const dayEntries = byDate.get(iso) ?? [];
                    const isToday = iso === todayIso;

                    return (
                      <div
                        key={iso}
                        className={`flex min-h-[86px] flex-col gap-1 border-l p-1 dark:border-neutral-800 ${
                          day.inMonth ? "" : "bg-neutral-50/70 dark:bg-neutral-900/40"
                        } ${day.isWeekend ? "bg-neutral-50 dark:bg-neutral-900/30" : ""}`}
                      >
                        <span
                          className={`text-xs tabular-nums ${
                            isToday
                              ? "grid h-5 w-5 place-items-center rounded-full bg-primary font-bold text-primary-foreground"
                              : day.inMonth
                                ? "text-neutral-600 dark:text-neutral-300"
                                : "text-neutral-400 dark:text-neutral-600"
                          }`}
                        >
                          {day.date.getDate()}
                        </span>

                        {dayEntries.slice(0, MAX_ENTRIES_PER_DAY).map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => onEntryClick(entry)}
                            title={entry.title}
                            className={`truncate rounded border border-l-4 px-1 py-0.5 text-left text-[11px] leading-tight ${
                              KIND_STYLE[entry.kind].chip
                            } ${KIND_STYLE[entry.kind].border} ${
                              entry.cancelled ? "line-through opacity-70" : ""
                            }`}
                          >
                            {entry.startTime && (
                              <span className="mr-1 tabular-nums opacity-75">{entry.startTime}</span>
                            )}
                            {entry.title}
                          </button>
                        ))}

                        {dayEntries.length > MAX_ENTRIES_PER_DAY && (
                          <span className="px-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                            +{dayEntries.length - MAX_ENTRIES_PER_DAY} {t.events.more}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-300">{t.calendar.weekRailHint}</p>
      </CardContent>
    </Card>
  );
}
