import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { CalendarEntry } from "@shared/calendar-entries";
import { monthsForSchoolYear, toCalendarIsoDate, weeksOfMonth } from "@shared/yearly-calendar-display";

interface CalendarYearViewProps {
  entries: CalendarEntry[];
  schoolYear: number;
  onMonthPick: (month: { year: number; month: number }) => void;
}

// At this size a day can show three dots before they stop being countable.
const MAX_DOTS = 3;

/**
 * The kindergarten year as twelve small month calendars.
 *
 * Nothing here is readable as text, and that is the point: this view answers
 * "when is it busy, and when is it quiet" at a glance, and hands the month
 * over to the month view for anything more. Each day that has something gets
 * a dot per kind, so a week of planning days looks different from a week with
 * one dugnad in it.
 */
export default function CalendarYearView({ entries, schoolYear, onMonthPick }: CalendarYearViewProps) {
  const { language, t } = useLanguage();
  const todayIso = toCalendarIsoDate(new Date());
  const now = new Date();

  // Only dated entries can sit on a day. A week-long temauke would otherwise
  // paint seven identical dots and drown everything that actually happens.
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      if (!entry.date) continue;
      const forDay = map.get(entry.date);
      if (forDay) forDay.push(entry);
      else map.set(entry.date, [entry]);
    }
    return map;
  }, [entries]);

  const months = useMemo(() => monthsForSchoolYear(schoolYear), [schoolYear]);

  // Weekday initials, taken from a real week so the locale stays formatDate's
  // business rather than a hardcoded list per language.
  const weekdayInitials = useMemo(() => {
    const week = weeksOfMonth(months[0].year, months[0].month)[0];
    return week.days.map((day) => formatDate(day.date, language, { weekday: "narrow" }));
  }, [months, language]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {months.map((ref) => {
          const weeks = weeksOfMonth(ref.year, ref.month);
          const isCurrentMonth =
            ref.year === now.getFullYear() && ref.month === now.getMonth() + 1;

          return (
            <button
              key={`${ref.year}-${ref.month}`}
              type="button"
              onClick={() => onMonthPick(ref)}
              className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                isCurrentMonth
                  ? "border-accent/50 bg-accent/5 ring-1 ring-accent/20"
                  : "border-hairline bg-white hover:border-hairline"
              }`}
            >
              <h3 className="font-heading text-base font-semibold capitalize text-ink">
                {formatDate(new Date(ref.year, ref.month - 1, 1), language, { month: "long" })}{" "}
                <span className="font-normal tabular-nums text-subtle">
                  {ref.year}
                </span>
              </h3>

              <div className="mt-3 grid grid-cols-7 gap-y-1">
                {weekdayInitials.map((initial, index) => (
                  <span
                    key={index}
                    className="text-center text-[10px] font-medium uppercase text-subtle"
                  >
                    {initial}
                  </span>
                ))}

                {weeks.flatMap((week) =>
                  week.days.map((day) => {
                    const iso = toCalendarIsoDate(day.date);
                    const dayEntries = day.inMonth ? (byDate.get(iso) ?? []) : [];
                    const isToday = iso === todayIso;

                    return (
                      <span key={iso} className="flex flex-col items-center gap-0.5 pb-0.5">
                        <span
                          className={`grid h-5 w-5 place-items-center rounded-full text-[11px] tabular-nums ${
                            isToday
                              ? "bg-accent font-semibold text-accent-foreground"
                              : day.inMonth
                                ? "text-copy"
                                : "text-subtle/60"
                          }`}
                        >
                          {day.date.getDate()}
                        </span>
                        <span className="flex h-1.5 items-center gap-[2px]">
                          {dayEntries.slice(0, MAX_DOTS).map((entry) => (
                            <span
                              key={entry.id}
                              className={`h-1.5 w-1.5 rounded-full ${KIND_STYLE[entry.kind].dot}`}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                      </span>
                    );
                  }),
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-subtle">{t.calendar.yearViewHint}</p>
    </div>
  );
}
