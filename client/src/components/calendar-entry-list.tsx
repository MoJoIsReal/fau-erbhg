import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { CalendarEntry } from "@shared/calendar-entries";
import { groupCalendarEntriesByWeek, isoWeekRange } from "@shared/calendar-entries";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate, type Language } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { Event } from "@shared/schema";

function Dot({ kind }: { kind: CalendarEntry["kind"] }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_STYLE[kind].dot}`} aria-hidden="true" />;
}

// formatDate owns the locale mapping, so the date margin reads its weekday and
// month from there rather than reaching for a locale id.
function dateParts(date: Date, language: Language) {
  return {
    weekday: formatDate(date, language, { weekday: "short" }),
    day: date.getDate(),
  };
}

function SignupSide({ entry, onRegister }: { entry: CalendarEntry; onRegister: (event: Event) => void }) {
  const { t } = useLanguage();
  const signup = entry.signup;

  if (entry.cancelled) {
    return (
      <span className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
        {t.events.cancelled2}
      </span>
    );
  }
  if (!signup) return null;

  const note = (text: string) => (
    <span className="text-sm text-neutral-500 dark:text-neutral-400">{text}</span>
  );
  if (signup.mode === "internal") return note(t.events.internalEvent);
  if (signup.mode === "vigilo") return note(t.events.registerVigilo);
  if (signup.mode === "none") return note(t.events.noSignupRequired);

  return (
    <div className="flex items-center gap-3">
      {signup.maxAttendees !== null && (
        <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
          {signup.currentAttendees}/{signup.maxAttendees}
        </span>
      )}
      {signup.isFull ? (
        note(t.events.full)
      ) : signup.deadlinePassed ? (
        note(t.events.registrationClosed)
      ) : (
        <Button size="sm" variant="outline" onClick={() => entry.event && onRegister(entry.event)}>
          {t.events.register}
        </Button>
      )}
    </div>
  );
}

function DatedRow({
  entry,
  onRegister,
  onSelect,
  isSelected,
}: {
  entry: CalendarEntry;
  onRegister: (event: Event) => void;
  onSelect: (entry: CalendarEntry) => void;
  isSelected: boolean;
}) {
  const { language, t } = useLanguage();
  const date = new Date(entry.date as string);
  const { weekday, day } = dateParts(date, language);
  const time = entry.startTime
    ? entry.endTime
      ? `${entry.startTime}–${entry.endTime}`
      : entry.startTime
    : "";
  const meta = [time, entry.location].filter(Boolean).join(" · ");

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors sm:flex-nowrap sm:px-5 ${
        isSelected ? "bg-neutral-100/70 dark:bg-neutral-900" : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
      }`}
    >
      <div className="w-10 shrink-0 text-center leading-none">
        <div className="text-[11px] uppercase text-neutral-400 dark:text-neutral-500">{weekday}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50">
          {day}
        </div>
      </div>

      <div className="min-w-[11rem] flex-1 basis-0">
        <button
          type="button"
          onClick={() => onSelect(entry)}
          aria-current={isSelected ? "true" : undefined}
          className="flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950"
        >
          <Dot kind={entry.kind} />
          <span
            className={`font-medium text-neutral-900 dark:text-neutral-50 ${
              entry.cancelled ? "line-through decoration-1" : ""
            }`}
          >
            {entry.title}
          </span>
        </button>
        <div className="mt-0.5 pl-4 text-sm text-neutral-500 dark:text-neutral-400">
          <span className={KIND_STYLE[entry.kind].text}>{t.calendar.kinds[entry.kind]}</span>
          {meta && <span> · {meta}</span>}
        </div>
      </div>

      {(entry.signup || entry.cancelled) && (
        <div className="w-full shrink-0 pl-14 sm:w-auto sm:pl-0 sm:text-right">
          <SignupSide entry={entry} onRegister={onRegister} />
        </div>
      )}
    </li>
  );
}

function SpanningRow({
  entry,
  onSelect,
  isSelected,
}: {
  entry: CalendarEntry;
  onSelect: (entry: CalendarEntry) => void;
  isSelected: boolean;
}) {
  const { t } = useLanguage();
  const span =
    entry.weekEnd > entry.week
      ? `${t.calendar.weeksSpan} ${entry.week}–${entry.weekEnd}`
      : t.calendar.allWeek;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(entry)}
        aria-current={isSelected ? "true" : undefined}
        className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5 ${
          isSelected ? "bg-neutral-100/70 dark:bg-neutral-900" : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
        }`}
      >
        <Dot kind={entry.kind} />
        <span className={`shrink-0 ${KIND_STYLE[entry.kind].text}`}>{t.calendar.kinds[entry.kind]}</span>
        <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-200">{entry.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-neutral-400 dark:text-neutral-500">{span}</span>
      </button>
    </li>
  );
}

interface CalendarEntryListProps {
  entries: CalendarEntry[];
  /** Weeks before this one are hidden; null shows the whole school year. */
  fromWeekKey: number | null;
  currentWeekKey: number;
  onShowEarlier: (() => void) | null;
  onRegister: (event: Event) => void;
  onSelect: (entry: CalendarEntry) => void;
  selectedId: string | null;
  emptyMessage: string;
}

/**
 * The calendar as one week-grouped list. What lasts a whole week (varmmat,
 * temauke, beskjed) sits in a quiet band under the week heading; what happens
 * on a day sits below it with the date in the margin — which is what lets the
 * two former tabs share one list without either being squeezed into the
 * other's shape.
 *
 * Filtering and fetching belong to the calendar container; this renders what
 * it is handed.
 */
export default function CalendarEntryList({
  entries,
  fromWeekKey,
  currentWeekKey,
  onShowEarlier,
  onRegister,
  onSelect,
  selectedId,
  emptyMessage,
}: CalendarEntryListProps) {
  const { language, t } = useLanguage();

  const groups = useMemo(
    () => groupCalendarEntriesByWeek(entries, { fromWeekKey }),
    [entries, fromWeekKey],
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white px-6 py-16 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      {onShowEarlier && (
        <button
          type="button"
          onClick={onShowEarlier}
          className="mb-3 text-sm text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-50"
        >
          {t.calendar.showEarlier}
        </button>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {groups.map((group, index) => {
          const { start, end } = isoWeekRange(group.weekYear, group.week);
          const range = `${formatDate(start, language, { day: "numeric", month: "short" })} – ${formatDate(
            end,
            language,
            { day: "numeric", month: "short" },
          )}`;
          const isNow = group.weekKey === currentWeekKey;

          return (
            <section
              key={group.weekKey}
              className={index > 0 ? "border-t border-neutral-200 dark:border-neutral-800" : ""}
            >
              <h3
                className={`flex items-baseline gap-3 px-4 pb-2 pt-4 sm:px-5 ${
                  isNow ? "" : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                <span
                  className={`text-xs font-semibold uppercase tracking-[0.12em] tabular-nums ${
                    isNow ? "text-primary" : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {t.calendar.week} {group.week}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">{range}</span>
                {isNow && (
                  <span className="ml-auto text-xs font-medium text-primary">{t.calendar.thisWeek}</span>
                )}
              </h3>

              {group.spanning.length > 0 && (
                <ul className="pb-1">
                  {group.spanning.map((entry) => (
                    <SpanningRow
                      key={entry.id}
                      entry={entry}
                      onSelect={onSelect}
                      isSelected={entry.id === selectedId}
                    />
                  ))}
                </ul>
              )}

              {group.dated.length > 0 && (
                <ul className="divide-y divide-neutral-100 border-t border-neutral-100 dark:divide-neutral-900 dark:border-neutral-900">
                  {group.dated.map((entry) => (
                    <DatedRow
                      key={entry.id}
                      entry={entry}
                      onRegister={onRegister}
                      onSelect={onSelect}
                      isSelected={entry.id === selectedId}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="pt-4 text-center text-xs text-neutral-400 dark:text-neutral-500">{t.calendar.endOfList}</p>
    </div>
  );
}
