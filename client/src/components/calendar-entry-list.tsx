import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalendarEntry } from "@shared/calendar-entries";
import { groupCalendarEntriesByWeek, isoWeekRange } from "@shared/calendar-entries";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate, type Language } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { Event } from "@shared/schema";

interface CalendarEntryListProps {
  entries: CalendarEntry[];
  /** Weeks before this one are hidden; null shows the whole school year. */
  fromWeekKey: number | null;
  currentWeekKey: number;
  onShowEarlier: (() => void) | null;
  onRegister: (event: Event) => void;
  onSelect: (entry: CalendarEntry) => void;
  emptyMessage: string;
}

/**
 * What the week itself is about, as a sentence rather than a stack of rows.
 *
 * A temauke and the week's hot meal are facts about the whole week, not
 * things that happen at a time, so they read better as the week's standfirst
 * than as rows pretending to be events.
 */
function weekSummary(spanning: CalendarEntry[], foodLabel: string): string {
  const parts: string[] = [];
  for (const entry of spanning) {
    if (entry.kind === "varmmat") {
      parts.push(`${foodLabel} ${entry.title}.`);
      continue;
    }
    const detail = entry.description?.replace(/<[^>]*>/g, "").trim();
    parts.push(detail ? `${entry.title} – ${detail}` : `${entry.title}.`);
  }
  return parts.join(" ");
}

function DayRow({
  entry,
  onRegister,
  onSelect,
  language,
}: {
  entry: CalendarEntry;
  onRegister: (event: Event) => void;
  onSelect: (entry: CalendarEntry) => void;
  language: Language;
}) {
  const { t } = useLanguage();
  const date = new Date(entry.date as string);
  const signup = entry.signup;
  const time = entry.startTime
    ? entry.endTime
      ? `${t.calendar.detailTimePrefix} ${entry.startTime} – ${entry.endTime}`
      : `${t.calendar.detailTimePrefix} ${entry.startTime}`
    : "";
  const meta = [time, entry.location].filter(Boolean).join(" · ");

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 transition-colors hover:bg-green-50 sm:px-5">
      <div className="pt-0.5 leading-tight">
        <div className="text-[11px] font-medium uppercase tracking-wide text-subtle">
          {formatDate(date, language, { weekday: "short" })}
        </div>
        <div className="text-sm font-medium tabular-nums text-copy">
          {date.getDate()}. {formatDate(date, language, { month: "short" })}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect(entry)}
            className="flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${KIND_STYLE[entry.kind].dot}`}
              aria-hidden="true"
            />
            <span
              className={`font-medium text-ink hover:underline ${
                entry.cancelled ? "line-through decoration-1" : ""
              }`}
            >
              {entry.title}
            </span>
          </button>

          {entry.kind === "stengt" && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {t.calendar.kinds.stengt}
            </span>
          )}
          {entry.cancelled && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {t.events.cancelled2}
            </span>
          )}
        </div>

        {meta && <p className="mt-0.5 pl-4 text-sm text-subtle">{meta}</p>}

        {signup?.mode === "registration" && !entry.cancelled && (
          <div className="mt-2 flex flex-wrap items-center gap-3 pl-4">
            {signup.maxAttendees !== null && (
              <span className="text-sm tabular-nums text-subtle">
                {signup.currentAttendees}/{signup.maxAttendees} {t.events.attendees}
              </span>
            )}
            {signup.isOpen ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => entry.event && onRegister(entry.event)}
              >
                {t.events.register}
              </Button>
            ) : (
              <span className="text-sm text-subtle">
                {signup.isFull ? t.events.full : t.events.registrationClosed}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The calendar as a stack of week cards.
 *
 * The week is the unit the kindergarten already speaks in, so it is the card:
 * its number in the margin, what the week is about as a standfirst, and the
 * days inside it. A week with nothing dated in it still has something to say —
 * the hot meal, the theme — and says it without pretending to be empty.
 */
export default function CalendarEntryList({
  entries,
  fromWeekKey,
  currentWeekKey,
  onShowEarlier,
  onRegister,
  onSelect,
  emptyMessage,
}: CalendarEntryListProps) {
  const { language, t } = useLanguage();
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const groups = useMemo(
    () => groupCalendarEntriesByWeek(entries, { fromWeekKey }),
    [entries, fromWeekKey],
  );

  const toggle = (weekKey: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(weekKey)) next.delete(weekKey);
      else next.add(weekKey);
      return next;
    });

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-white px-6 py-16 text-center text-subtle">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {onShowEarlier && (
        <button
          type="button"
          onClick={onShowEarlier}
          className="text-sm text-subtle underline-offset-4 hover:text-ink hover:underline"
        >
          {t.calendar.showEarlier}
        </button>
      )}

      {groups.map((group) => {
        const { start, end } = isoWeekRange(group.weekYear, group.week);
        const sameMonth = start.getMonth() === end.getMonth();
        const range = `${start.getDate()}.${
          sameMonth ? "" : ` ${formatDate(start, language, { month: "long" })}`
        } – ${end.getDate()}. ${formatDate(end, language, { month: "long" })}`;
        const isNow = group.weekKey === currentWeekKey;
        const summary = weekSummary(group.spanning, t.calendar.weeklyFood);
        const isOpen = !collapsed.has(group.weekKey);

        return (
          <section
            key={group.weekKey}
            className={`overflow-hidden rounded-2xl border bg-surface ${
              isNow ? "border-accent/40 ring-1 ring-accent/20" : "border-hairline"
            }`}
          >
            <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
              <div
                className={`w-14 shrink-0 rounded-xl px-2 py-2 text-center ${
                  isNow ? "bg-accent/10" : "bg-green-50"
                }`}
              >
                <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-subtle">
                  {t.calendar.week}
                </div>
                <div
                  className={`text-2xl font-bold tabular-nums leading-tight ${
                    isNow ? "text-accent dark:text-emerald-300" : "text-ink"
                  }`}
                >
                  {group.week}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-lg font-semibold text-ink">
                    {range}
                  </h3>
                  {isNow && (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                      {t.calendar.thisWeek}
                    </span>
                  )}
                </div>
                {summary && (
                  <p className="mt-1 text-sm text-subtle">{summary}</p>
                )}
                {group.dated.length === 0 && (
                  <p className="mt-2 text-sm text-subtle">
                    {t.calendar.noEventsThisWeek}
                  </p>
                )}
              </div>

              {group.dated.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(group.weekKey)}
                  aria-expanded={isOpen}
                  aria-label={range}
                  className="shrink-0 rounded-full p-2 text-subtle transition-colors hover:bg-green-50 hover:text-copy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              )}
            </div>

            {isOpen && group.dated.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {group.dated.map((entry) => (
                  <DayRow
                    key={entry.id}
                    entry={entry}
                    onRegister={onRegister}
                    onSelect={onSelect}
                    language={language}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <p className="pt-2 text-center text-xs text-subtle">{t.calendar.endOfList}</p>
    </div>
  );
}
