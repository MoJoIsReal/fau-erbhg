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
 * The whole kindergarten year as twelve month cards.
 *
 * One long column of fifty-two week rows is a log, not a calendar: at reading
 * width every row is the same, and the shape of the year disappears. As cards
 * in a grid the months keep their own edges, a quiet December reads as quiet
 * next to a busy September, and the page uses the width it has.
 *
 * Inside a card each week is one line — its number, then what is in it — which
 * is what keeps the year on a screen or two rather than fifteen.
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
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {months.map((group) => {
          const hasCurrentWeek = group.weeks.some(
            (week) => calendarWeekKey(week.weekYear, week.week) === currentWeekKey,
          );

          return (
            <section
              key={group.key}
              className={`overflow-hidden rounded-2xl border bg-white dark:bg-neutral-950 ${
                hasCurrentWeek
                  ? "border-primary/40 ring-1 ring-primary/20"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <h3 className="flex items-baseline gap-2 border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
                <span className="font-heading text-base font-semibold capitalize tracking-tight text-neutral-900 dark:text-neutral-50">
                  {formatDate(new Date(group.year, group.month - 1, 1), language, { month: "long" })}
                </span>
                <span className="text-sm tabular-nums text-neutral-400 dark:text-neutral-500">{group.year}</span>
              </h3>

              <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
                {group.weeks.map((week) => {
                  const key = calendarWeekKey(week.weekYear, week.week);
                  const weekEntries = byWeek.get(key) ?? [];
                  const isNow = key === currentWeekKey;

                  return (
                    <li
                      key={key}
                      className={`grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-3 px-4 py-2 ${
                        isNow ? "bg-primary/5" : ""
                      }`}
                    >
                      <span
                        className={`text-right text-sm tabular-nums ${
                          isNow
                            ? "font-semibold text-primary"
                            : "font-medium text-neutral-400 dark:text-neutral-500"
                        }`}
                      >
                        {week.week}
                      </span>

                      {weekEntries.length === 0 ? (
                        <span className="text-sm text-neutral-300 dark:text-neutral-700">—</span>
                      ) : (
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                          {weekEntries.map((entry) => {
                            const date = entry.date ? parseCalendarDate(entry.date) : null;
                            return (
                              <button
                                key={`${key}-${entry.id}`}
                                type="button"
                                onClick={() => onEntryClick(entry)}
                                title={entry.title}
                                className="flex max-w-full items-baseline gap-1.5 text-left text-sm leading-snug text-neutral-700 transition-colors hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:text-neutral-300 dark:hover:text-neutral-50"
                              >
                                <span
                                  className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full ${
                                    KIND_STYLE[entry.kind].dot
                                  }`}
                                  aria-hidden="true"
                                />
                                {date && (
                                  <span className="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500">
                                    {date.getDate()}.
                                  </span>
                                )}
                                <span
                                  className={`truncate ${entry.cancelled ? "line-through decoration-1" : ""}`}
                                >
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
          );
        })}
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.calendar.yearViewHint}</p>
    </div>
  );
}
