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

// Three before a cell starts stretching its whole row. The rest are behind a
// "+N mer" that expands the cell in place.
const MAX_PER_CELL = 3;

/**
 * An entry inside a grid cell, as a soft tinted block.
 *
 * A filled block is wrong on a list row, where hairlines already separate one
 * row from the next — there it is just noise. In a grid it is the opposite: a
 * cell is a container, and a block is the only shape that reads as "something
 * is booked here" rather than as a stray line of text.
 */
function EntryChip({
  entry,
  onClick,
  dense,
}: {
  entry: CalendarEntry;
  onClick: (entry: CalendarEntry) => void;
  dense?: boolean;
}) {
  const style = KIND_STYLE[entry.kind];
  return (
    <button
      type="button"
      onClick={() => onClick(entry)}
      title={entry.title}
      className={`flex w-full items-baseline gap-1.5 rounded-md border-l-[3px] px-1.5 text-left leading-snug text-neutral-800 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:text-neutral-100 ${
        style.tint
      } ${style.bar} ${dense ? "py-0.5 text-[11px]" : "py-1 text-xs"}`}
    >
      {entry.startTime && (
        <span className="shrink-0 tabular-nums opacity-60">{entry.startTime}</span>
      )}
      <span className={`truncate ${entry.cancelled ? "line-through decoration-1" : ""}`}>
        {entry.title}
      </span>
    </button>
  );
}

function MoreButton({ count, onClick, label }: { count: number; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
    >
      +{count} {label}
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
  // Cells and rails that the reader has opened, keyed by their own id.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const expand = (key: string) => setExpanded((prev) => new Set(prev).add(key));

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
    setExpanded(new Set());
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

  const columns = "grid grid-cols-[9.5rem_repeat(7,minmax(0,1fr))]";

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="font-heading text-xl font-semibold capitalize tracking-tight text-neutral-900 dark:text-neutral-50">
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
        <div className="min-w-[760px]">
          <div className={`${columns} border-b border-neutral-200 dark:border-neutral-800`}>
            <div className="px-3 py-2.5 text-xs font-medium uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              {t.calendar.week}
            </div>
            {weekdayNames.map((name, index) => (
              <div
                key={name + index}
                className="px-2.5 py-2.5 text-xs font-medium uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400"
              >
                {name}
              </div>
            ))}
          </div>

          {weeks.map((week, weekIndex) => {
            const weekYear = isoWeekYear(week.days[0].date);
            const railKey = `rail-${weekYear}-${week.weekNumber}`;
            const railEntries = railEntriesFor(week.weekNumber, weekYear);
            const railOpen = expanded.has(railKey);
            const railShown = railOpen ? railEntries : railEntries.slice(0, MAX_PER_CELL);

            return (
              <div
                key={`${weekYear}-${week.weekNumber}`}
                className={`${columns} ${
                  weekIndex > 0 ? "border-t border-neutral-100 dark:border-neutral-900" : ""
                }`}
              >
                <div className="flex flex-col gap-1 border-r border-neutral-200 bg-neutral-50 px-2.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/50">
                  <span className="px-0.5 text-sm font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
                    {week.weekNumber}
                  </span>
                  {railShown.map((entry) => (
                    <EntryChip key={entry.id} entry={entry} onClick={onEntryClick} dense />
                  ))}
                  {!railOpen && railEntries.length > MAX_PER_CELL && (
                    <MoreButton
                      count={railEntries.length - MAX_PER_CELL}
                      onClick={() => expand(railKey)}
                      label={t.events.more}
                    />
                  )}
                </div>

                {week.days.map((day) => {
                  const iso = toCalendarIsoDate(day.date);
                  const dayEntries = byDate.get(iso) ?? [];
                  const isToday = iso === todayIso;
                  const open = expanded.has(iso);
                  const shown = open ? dayEntries : dayEntries.slice(0, MAX_PER_CELL);

                  return (
                    <div
                      key={iso}
                      className={`flex min-h-[120px] flex-col gap-1 px-1.5 py-2.5 ${
                        day.inMonth ? "" : "bg-neutral-50/50 dark:bg-neutral-900/30"
                      }`}
                    >
                      <span
                        className={`ml-1 text-sm font-medium tabular-nums ${
                          isToday
                            ? "grid h-7 w-7 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
                            : day.inMonth
                              ? "text-neutral-900 dark:text-neutral-100"
                              : "text-neutral-300 dark:text-neutral-700"
                        }`}
                      >
                        {day.date.getDate()}
                      </span>

                      {shown.map((entry) => (
                        <EntryChip key={entry.id} entry={entry} onClick={onEntryClick} />
                      ))}
                      {!open && dayEntries.length > MAX_PER_CELL && (
                        <MoreButton
                          count={dayEntries.length - MAX_PER_CELL}
                          onClick={() => expand(iso)}
                          label={t.events.more}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        {t.calendar.weekRailHint}
      </p>
    </div>
  );
}
