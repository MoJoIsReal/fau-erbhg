import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { CalendarEntry } from "@shared/calendar-entries";
import {
  calendarWeekKey,
  compareSpanningEntries,
  isoWeekYear,
  parseCalendarDate,
  schoolYearWeeks,
} from "@shared/calendar-entries";
import { isoWeek } from "@shared/yearly-calendar-display";

interface CalendarYearViewProps {
  entries: CalendarEntry[];
  schoolYear: number;
  onEntryClick: (entry: CalendarEntry) => void;
}

/**
 * The whole kindergarten year, one row per ISO week, months down the margin.
 *
 * This is the yearly calendar without being a separate page: same entries,
 * same filters, just denser. Quiet weeks are shown as quiet rather than
 * skipped — when you are looking for a free Saturday for a dugnad, the empty
 * rows are the answer.
 */
export default function CalendarYearView({ entries, schoolYear, onEntryClick }: CalendarYearViewProps) {
  const { language, t } = useLanguage();

  const weeks = useMemo(() => schoolYearWeeks(schoolYear), [schoolYear]);

  const byWeek = useMemo(() => {
    const map = new Map<number, CalendarEntry[]>();
    for (const entry of entries) {
      for (let week = entry.week; week <= entry.weekEnd; week++) {
        const key = calendarWeekKey(entry.weekYear, week);
        const forWeek = map.get(key);
        if (forWeek) forWeek.push(entry);
        else map.set(key, [entry]);
      }
    }
    // Week-wide entries lead each row, same as the list's band and the month
    // grid's rail; dated ones follow in date order.
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (!a.date && !b.date) return compareSpanningEntries(a, b);
        if (!a.date) return -1;
        if (!b.date) return 1;
        return a.sortKey - b.sortKey || a.title.localeCompare(b.title, "no");
      });
    }
    return map;
  }, [entries]);

  const today = new Date();
  const currentWeekKey = calendarWeekKey(isoWeekYear(today), isoWeek(today));

  // Months in kindergarten-year order, each with the weeks that belong to it.
  const months = useMemo(() => {
    const groups: { key: string; month: number; year: number; weeks: typeof weeks }[] = [];
    for (const week of weeks) {
      const key = `${week.year}-${week.month}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.weeks.push(week);
      else groups.push({ key, month: week.month, year: week.year, weeks: [week] });
    }
    return groups;
  }, [weeks]);

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col gap-1">
          {months.map((group) => (
            <section
              key={group.key}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 border-t py-2 first:border-t-0 dark:border-neutral-800 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-3"
            >
              <h3 className="pt-1 text-sm font-semibold leading-tight text-neutral-700 dark:text-neutral-200">
                {formatDate(new Date(group.year, group.month - 1, 1), language, { month: "long" })}
                <span className="block text-xs font-normal tabular-nums text-neutral-500 dark:text-neutral-400">
                  {group.year}
                </span>
              </h3>

              <div className="flex min-w-0 flex-col gap-1">
                {group.weeks.map((week) => {
                  const key = calendarWeekKey(week.weekYear, week.week);
                  const weekEntries = byWeek.get(key) ?? [];
                  const isNow = key === currentWeekKey;

                  return (
                    <div
                      key={key}
                      className={`grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 rounded-md px-1 py-0.5 ${
                        isNow ? "bg-primary/10 ring-1 ring-primary/40" : ""
                      }`}
                    >
                      <span
                        className={`text-right text-xs tabular-nums ${
                          isNow
                            ? "font-bold text-primary"
                            : "text-neutral-500 dark:text-neutral-400"
                        }`}
                      >
                        {week.week}
                      </span>

                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {weekEntries.length === 0 ? (
                          <span className="text-xs italic text-neutral-400 dark:text-neutral-600">
                            {t.calendar.quietWeek}
                          </span>
                        ) : (
                          weekEntries.map((entry) => {
                            const date = entry.date ? parseCalendarDate(entry.date) : null;
                            return (
                              <button
                                key={`${key}-${entry.id}`}
                                type="button"
                                onClick={() => onEntryClick(entry)}
                                title={entry.title}
                                className={`max-w-full truncate rounded border border-l-4 px-2 py-1 text-left text-xs leading-tight ${
                                  KIND_STYLE[entry.kind].chip
                                } ${KIND_STYLE[entry.kind].border} ${
                                  entry.cancelled ? "line-through opacity-70" : ""
                                }`}
                              >
                                {date && (
                                  <span className="mr-1.5 tabular-nums opacity-75">
                                    {formatDate(date, language, { day: "numeric", month: "short" })}
                                  </span>
                                )}
                                {entry.title}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-300">{t.calendar.yearViewHint}</p>
      </CardContent>
    </Card>
  );
}
