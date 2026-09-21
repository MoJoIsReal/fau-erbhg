import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CalendarEntry } from "@shared/calendar-entries";
import { groupCalendarEntriesByWeek, isoWeekRange } from "@shared/calendar-entries";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate, type Language } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { Event } from "@shared/schema";
import SafeHtml from "@/components/safe-html";

// formatDate already owns the locale mapping, so the date margin gets its
// weekday and month from there rather than reaching for a locale id here.
function weekdayAndDay(date: Date, language: Language) {
  return {
    weekday: formatDate(date, language, { weekday: "short" }),
    day: date.getDate(),
    month: formatDate(date, language, { month: "short" }),
  };
}

function SignupSide({ entry, onRegister }: { entry: CalendarEntry; onRegister: (event: Event) => void }) {
  const { t } = useLanguage();
  const signup = entry.signup;

  if (entry.cancelled) {
    return <span className="text-sm font-semibold text-red-600 dark:text-red-300">{t.events.cancelled2}</span>;
  }
  if (!signup) return null;

  if (signup.mode === "internal") {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">{t.events.internalEvent}</span>;
  }
  if (signup.mode === "vigilo") {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">{t.events.registerVigilo}</span>;
  }
  if (signup.mode === "none") {
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">{t.events.noSignupRequired}</span>;
  }

  return (
    <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
      {signup.maxAttendees !== null && (
        <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
          {signup.currentAttendees}/{signup.maxAttendees} {t.events.attendees}
        </span>
      )}
      {signup.isFull ? (
        <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">{t.events.full}</span>
      ) : signup.deadlinePassed ? (
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{t.events.registrationClosed}</span>
      ) : (
        <Button size="sm" onClick={() => entry.event && onRegister(entry.event)}>
          {t.events.register}
        </Button>
      )}
    </div>
  );
}

function DatedRow({ entry, onRegister }: { entry: CalendarEntry; onRegister: (event: Event) => void }) {
  const { language, t } = useLanguage();
  const style = KIND_STYLE[entry.kind];
  const date = new Date(entry.date as string);
  const { weekday, day, month } = weekdayAndDay(date, language);
  const time = entry.startTime
    ? entry.endTime
      ? `${entry.startTime}–${entry.endTime}`
      : entry.startTime
    : "";
  const meta = [time, entry.location].filter(Boolean).join(" · ");

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-l-4 px-3 py-3 sm:flex-nowrap sm:px-4 ${
        style.border
      } ${entry.cancelled ? "opacity-70" : ""}`}
    >
      <div className="w-11 shrink-0 text-center leading-tight">
        <div className="text-xs uppercase text-neutral-500 dark:text-neutral-400">{weekday}</div>
        <div className="text-lg font-bold tabular-nums text-neutral-900 dark:text-neutral-50">{day}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{month}</div>
      </div>

      <div className="min-w-[12rem] flex-1 basis-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-semibold text-neutral-900 dark:text-neutral-50 ${
              entry.cancelled ? "line-through" : ""
            }`}
          >
            {entry.title}
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
            {t.calendar.kinds[entry.kind]}
          </span>
        </div>
        {meta && <div className="text-sm text-neutral-600 dark:text-neutral-300">{meta}</div>}
        {entry.description && (
          <SafeHtml
            html={entry.description}
            className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400"
          />
        )}
      </div>

      {(entry.signup || entry.cancelled) && (
        <div className="w-full shrink-0 pl-[3.75rem] sm:w-auto sm:pl-0 sm:text-right">
          <SignupSide entry={entry} onRegister={onRegister} />
        </div>
      )}
    </li>
  );
}

function SpanningRow({ entry }: { entry: CalendarEntry }) {
  const { t } = useLanguage();
  const style = KIND_STYLE[entry.kind];
  const span =
    entry.weekEnd > entry.week
      ? `${t.calendar.weeksSpan} ${entry.week}–${entry.weekEnd}`
      : t.calendar.allWeek;

  return (
    <li className={`flex items-center gap-3 rounded-md border border-l-4 px-3 py-2 ${style.chip} ${style.border}`}>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{t.calendar.kinds[entry.kind]}:</span> {entry.title}
      </span>
      <span className="shrink-0 text-xs tabular-nums opacity-80">{span}</span>
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
  emptyMessage: string;
}

/**
 * The calendar as one week-grouped list. What lasts a whole week (varmmat,
 * temauke, beskjed) sits in a band under the week heading; what happens on a
 * day sits below it with the date in the margin — which is what lets the two
 * former tabs share a single list without either one being squeezed into the
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
  emptyMessage,
}: CalendarEntryListProps) {
  const { language, t } = useLanguage();

  const groups = useMemo(
    () => groupCalendarEntriesByWeek(entries, { fromWeekKey }),
    [entries, fromWeekKey],
  );

  return (
    <div className="space-y-4">
      {onShowEarlier && (
        <Button variant="outline" size="sm" onClick={onShowEarlier}>
          {t.calendar.showEarlier}
        </Button>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-neutral-600 dark:text-neutral-300">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="divide-y divide-neutral-200 p-0 dark:divide-neutral-800">
              {groups.map((group) => {
                const { start, end } = isoWeekRange(group.weekYear, group.week);
                const range = `${formatDate(start, language, { day: "numeric", month: "short" })} – ${formatDate(
                  end,
                  language,
                  { day: "numeric", month: "short" },
                )}`;
                return (
                  <section key={group.weekKey} className="py-2">
                    <h3 className="flex flex-wrap items-baseline gap-2 px-3 pb-1 pt-2 sm:px-4">
                      <span className="text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                        {t.calendar.week} {group.week}
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">{range}</span>
                      {group.weekKey === currentWeekKey && (
                        <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                          {t.calendar.thisWeek}
                        </span>
                      )}
                    </h3>

                    {group.spanning.length > 0 && (
                      <ul className="flex flex-col gap-1 px-3 pb-1 sm:px-4">
                        {group.spanning.map((entry) => (
                          <SpanningRow key={entry.id} entry={entry} />
                        ))}
                      </ul>
                    )}

                    {group.dated.length > 0 && (
                      <ul className="flex flex-col">
                        {group.dated.map((entry) => (
                          <DatedRow key={entry.id} entry={entry} onRegister={onRegister} />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </CardContent>
          </Card>

          <p className="pb-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t.calendar.endOfList}
          </p>
        </>
      )}
    </div>
  );
}
