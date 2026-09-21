import { useMemo } from "react";
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
 * same filters, just denser. A year holds several hundred entries, so they are
 * set as plain text with a small dot rather than as filled chips — fifty-two
 * rows of coloured pills is a pattern, not a calendar. Quiet weeks stay
 * visible as quiet: when you are hunting for a free Saturday for a dugnad, the
 * empty rows are the answer.
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
    // Week-wide entries lead each row, as they do in the list's band and the
    // month grid's rail; dated ones follow in date order.
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
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      {months.map((group, index) => (
        <section
          key={group.key}
          className={index > 0 ? "border-t border-neutral-200 dark:border-neutral-800" : ""}
        >
          <h3 className="sticky top-0 z-10 bg-neutral-50/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 backdrop-blur dark:bg-neutral-900/80 dark:text-neutral-400 sm:px-5">
            <span className="capitalize">
              {formatDate(new Date(group.year, group.month - 1, 1), language, { month: "long" })}
            </span>{" "}
            <span className="font-normal tabular-nums text-neutral-400 dark:text-neutral-500">{group.year}</span>
          </h3>

          <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {group.weeks.map((week) => {
              const key = calendarWeekKey(week.weekYear, week.week);
              const weekEntries = byWeek.get(key) ?? [];
              const isNow = key === currentWeekKey;

              return (
                <li
                  key={key}
                  className={`grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-3 px-4 py-1.5 sm:px-5 ${
                    isNow ? "bg-primary/5" : ""
                  }`}
                >
                  <span
                    className={`text-right text-xs tabular-nums ${
                      isNow ? "font-semibold text-primary" : "text-neutral-400 dark:text-neutral-500"
                    }`}
                  >
                    {week.week}
                  </span>

                  {weekEntries.length === 0 ? (
                    <span className="text-xs text-neutral-300 dark:text-neutral-700">—</span>
                  ) : (
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                      {weekEntries.map((entry) => {
                        const date = entry.date ? parseCalendarDate(entry.date) : null;
                        return (
                          <button
                            key={`${key}-${entry.id}`}
                            type="button"
                            onClick={() => onEntryClick(entry)}
                            title={entry.title}
                            className="flex max-w-full items-baseline gap-1.5 text-left text-[13px] leading-snug text-neutral-700 transition-colors hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:text-neutral-300 dark:hover:text-neutral-50"
                          >
                            <span
                              className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full ${
                                KIND_STYLE[entry.kind].dot
                              }`}
                              aria-hidden="true"
                            />
                            {date && (
                              <span className="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500">
                                {formatDate(date, language, { day: "numeric", month: "short" })}
                              </span>
                            )}
                            <span className={`truncate ${entry.cancelled ? "line-through decoration-1" : ""}`}>
                              {entry.title}
                            </span>
                          </button>
                        );
                      })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 sm:px-5">
        {t.calendar.yearViewHint}
      </p>
    </div>
  );
}
