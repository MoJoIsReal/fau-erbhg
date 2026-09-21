import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

// Three per cell, three in the rail: past that a busy week stretches the row
// so far that the month stops reading as a month. The rest are counted, and
// the week list is there for anyone who wants all of them.
const MAX_PER_CELL = 3;

function EntryLine({
  entry,
  onClick,
}: {
  entry: CalendarEntry;
  onClick: (entry: CalendarEntry) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(entry)}
      title={entry.title}
      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] leading-tight text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_STYLE[entry.kind].dot}`} aria-hidden="true" />
      {entry.startTime && (
        <span className="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500">{entry.startTime}</span>
      )}
      <span className={`truncate ${entry.cancelled ? "line-through decoration-1" : ""}`}>{entry.title}</span>
    </button>
  );
}

/**
 * The month as a grid, with a week column down the left.
 *
 * That column is what lets one grid carry both calendars: everything lasting a
 * whole week (ukens varmmat, temauker, beskjeder) lives in the rail, and
 * everything tied to a date lives in the day cells. Neither has to be squeezed
 * into the other's shape — a week of hot meals was never a Monday.
 */
export default function CalendarView({ entries, onEntryClick }: CalendarViewProps) {
  const { language, t } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const weeks = useMemo(() => weeksOfMonth(year, month), [year, month]);

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

  // Weekday headers come from the first week's own days, so the locale stays
  // formatDate's business rather than a hardcoded list per language.
  const weekdayNames = weeks[0]?.days.map((day) => formatDate(day.date, language, { weekday: "short" })) ?? [];

  // Same ordering as the week list's band — varmmat first — so the rail and
  // the list never disagree about what a week leads with.
  const railEntriesFor = (weekNumber: number, weekYear: number) =>
    spanning
      .filter(
        (entry) =>
          entry.weekYear === weekYear && weekNumber >= entry.week && weekNumber <= entry.weekEnd,
      )
      .sort(compareSpanningEntries);

  const columns = "grid grid-cols-[8.5rem_repeat(7,minmax(0,1fr))]";

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-3 sm:px-5">
        <h3 className="font-heading text-lg font-semibold capitalize text-neutral-900 dark:text-neutral-50">
          {monthYearText}
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigateMonth("prev")} aria-label={t.events.previousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigateMonth("next")} aria-label={t.events.nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Eight columns need room to stay readable, so on a phone the grid
          scrolls sideways inside its own container rather than collapsing. */}
      <div className="overflow-x-auto border-t border-neutral-200 dark:border-neutral-800">
        <div className="min-w-[720px]">
          <div className={`${columns} border-b border-neutral-200 dark:border-neutral-800`}>
            <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
              {t.calendar.week}
            </div>
            {weekdayNames.map((name, index) => (
              <div
                key={name + index}
                className="px-2 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500"
              >
                {name}
              </div>
            ))}
          </div>

          {weeks.map((week, weekIndex) => {
            const weekYear = isoWeekYear(week.days[0].date);
            const railEntries = railEntriesFor(week.weekNumber, weekYear);

            return (
              <div
                key={`${weekYear}-${week.weekNumber}`}
                className={`${columns} ${
                  weekIndex > 0 ? "border-t border-neutral-100 dark:border-neutral-900" : ""
                }`}
              >
                <div className="flex flex-col gap-0.5 border-r border-neutral-200 bg-neutral-50/60 px-2 py-2 dark:border-neutral-800 dark:bg-neutral-900/40">
                  <span className="px-1 text-xs font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
                    {week.weekNumber}
                  </span>
                  {railEntries.slice(0, MAX_PER_CELL).map((entry) => (
                    <EntryLine key={entry.id} entry={entry} onClick={onEntryClick} />
                  ))}
                  {railEntries.length > MAX_PER_CELL && (
                    <span className="px-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                      +{railEntries.length - MAX_PER_CELL} {t.events.more}
                    </span>
                  )}
                </div>

                {week.days.map((day) => {
                  const iso = toCalendarIsoDate(day.date);
                  const dayEntries = byDate.get(iso) ?? [];
                  const isToday = iso === todayIso;

                  return (
                    <div
                      key={iso}
                      className={`flex min-h-[92px] flex-col gap-0.5 px-1 py-2 ${
                        day.isWeekend ? "bg-neutral-50/50 dark:bg-neutral-900/20" : ""
                      }`}
                    >
                      <span
                        className={`ml-1 text-xs tabular-nums ${
                          isToday
                            ? "grid h-5 w-5 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
                            : day.inMonth
                              ? "text-neutral-500 dark:text-neutral-400"
                              : "text-neutral-300 dark:text-neutral-700"
                        }`}
                      >
                        {day.date.getDate()}
                      </span>

                      {dayEntries.slice(0, MAX_PER_CELL).map((entry) => (
                        <EntryLine key={entry.id} entry={entry} onClick={onEntryClick} />
                      ))}
                      {dayEntries.length > MAX_PER_CELL && (
                        <span className="px-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                          +{dayEntries.length - MAX_PER_CELL} {t.events.more}
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

      <p className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 sm:px-5">
        {t.calendar.weekRailHint}
      </p>
    </div>
  );
}
