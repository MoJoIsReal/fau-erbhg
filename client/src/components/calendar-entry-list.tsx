import { calendarDisplayKind } from "@shared/calendar-entries";
import { CalendarCategory } from "@/components/site/calendar-category";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalendarEntry } from "@shared/calendar-entries";
import { groupCalendarEntriesByWeek, isoWeekRange } from "@shared/calendar-entries";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate, type Language } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import { StatusPill } from "@/components/site/controls";
import { EmptyState } from "@/components/site/section";
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
 * What the week itself is about, as facts rather than as rows.
 *
 * A temauke and the week's hot meal apply to the whole week, not to a time on
 * a day, so they belong in the week's header where they can be read once —
 * not repeated as five rows pretending to be events.
 */
function weekFacts(spanning: CalendarEntry[], foodLabel: string) {
  return spanning.map((entry) => {
    if (entry.kind === "varmmat") {
      return { id: entry.id, kind: entry.kind, label: foodLabel, value: entry.title };
    }
    const detail = entry.description?.replace(/<[^>]*>/g, "").trim();
    return { id: entry.id, kind: entry.kind, label: entry.title, value: detail ?? "" };
  });
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
  const style = KIND_STYLE[entry.displayKind];
  const date = new Date(entry.date as string);
  const signup = entry.signup;
  const time = entry.startTime
    ? entry.endTime
      ? `${entry.startTime}–${entry.endTime}`
      : entry.startTime
    : "";
  const meta = [time, entry.location].filter(Boolean).join(" · ");

  return (
    <li className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-4 px-4 py-4 transition-colors duration-micro ease-guide hover:bg-green-50/60 sm:grid-cols-[4rem_minmax(0,1fr)] sm:px-6">
      {/* The day, as a two-line block. Tabular figures keep the column of
          dates aligned down a long week (guide §3). */}
      <div className="pt-0.5 text-center leading-tight">
        <div className="text-micro font-semibold uppercase tracking-[0.1em] text-subtle">
          {formatDate(date, language, { weekday: "short" })}
        </div>
        <div className="text-h4 font-bold tabular-nums text-ink">{date.getDate()}</div>
        <div className="text-micro text-subtle">
          {formatDate(date, language, { month: "short" })}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={() => onSelect(entry)}
            className="inline-flex max-w-full items-baseline gap-2 text-left"
          >
            <span
              className={`text-body-lg font-semibold text-ink hover:text-brand hover:underline ${
                entry.cancelled ? "line-through decoration-1" : ""
              }`}
            >
              {entry.title}
            </span>
          </button>

          {/* The category in words beside its dot, so the colour is never
              carrying the meaning on its own (guide §7). */}
          <span className={`text-micro font-semibold ${style.text}`}>
            <CalendarCategory kind={entry.displayKind} />
          </span>

          {/* The kind label above already says "Stengt", so only a cancelled
              entry needs a pill of its own here. */}
          {entry.entry?.entryType === "closed" && <StatusPill tone="warn">{t.yearlyCalendar.closedBadge}</StatusPill>}
          {entry.cancelled && <StatusPill tone="warn">{t.events.cancelled2}</StatusPill>}
        </div>

        {meta && <p className="mt-1 pl-4 text-small tabular-nums text-subtle">{meta}</p>}

        {signup?.mode === "registration" && !entry.cancelled && (
          <div className="mt-2.5 flex flex-wrap items-center gap-3 pl-4">
            {signup.maxAttendees !== null && (
              <span className="text-small tabular-nums text-subtle">
                {signup.currentAttendees}/{signup.maxAttendees} {t.events.attendees}
              </span>
            )}
            {signup.isOpen ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-pill"
                onClick={() => entry.event && onRegister(entry.event)}
              >
                {t.events.register}
              </Button>
            ) : (
              <span className="text-small text-subtle">
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
 * The calendar as a stack of weeks.
 *
 * The week is the unit the kindergarten already speaks in — the årskalender is
 * written that way, and so is every message home — so the week is the card:
 * its number in the margin, what holds for the whole week stated once at the
 * top, and the dated things inside it. A week with nothing on a given day
 * still has something to say (the hot meal, the theme) and says it instead of
 * rendering as empty.
 *
 * The current week is marked three ways: a green surface, a green rule, and a
 * "Denne uken" pill that says so in words (guide §10A).
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
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      {onShowEarlier && (
        <button
          type="button"
          onClick={onShowEarlier}
          className="text-small font-semibold text-subtle underline-offset-4 hover:text-brand hover:underline"
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
        const facts = weekFacts(group.spanning, t.calendar.weeklyFood);
        const isOpen = !collapsed.has(group.weekKey);
        const headingId = `week-${group.weekKey}`;

        return (
          <section
            key={group.weekKey}
            aria-labelledby={headingId}
            className={`overflow-hidden rounded-card border ${
              isNow ? "border-brand/40 bg-green-50/40" : "border-hairline bg-surface"
            }`}
          >
            <div className="flex items-start gap-4 px-4 py-4 sm:px-6 sm:py-5">
              <div
                className={`w-14 shrink-0 rounded-token px-2 py-2 text-center ${
                  isNow ? "bg-brand text-primary-foreground" : "bg-green-50 text-brand"
                }`}
              >
                <div className="text-micro font-semibold uppercase tracking-[0.1em] opacity-80">
                  {t.calendar.week}
                </div>
                <div className="text-h3 font-bold leading-none tabular-nums">{group.week}</div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h3 id={headingId} className="text-h4 font-bold text-ink">
                    {range}
                  </h3>
                  {isNow && <StatusPill tone="now">{t.calendar.thisWeek}</StatusPill>}
                </div>

                {/* What holds all week, as labelled facts rather than a run-on
                    sentence: "Ukens varmmat: fiskegrateng" is a different kind
                    of statement from "Brannvernuke". */}
                {facts.length > 0 && (
                  <dl className="mt-2 space-y-1">
                    {facts.map((fact) => (
                      <div key={fact.id} className="flex flex-wrap items-baseline gap-x-2 text-small">
                        <dt className="inline-flex items-baseline gap-1.5 font-semibold text-ink">
                          <span
                            className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-pill ${
                              KIND_STYLE[calendarDisplayKind(fact.kind)].dot
                            }`}
                            aria-hidden="true"
                          />
                          {fact.label}
                        </dt>
                        {fact.value && <dd className="text-copy">{fact.value}</dd>}
                      </div>
                    ))}
                  </dl>
                )}

                {group.dated.length === 0 && (
                  <p className="mt-2 text-small text-subtle">{t.calendar.noEventsThisWeek}</p>
                )}
              </div>

              {group.dated.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(group.weekKey)}
                  aria-expanded={isOpen}
                  aria-controls={`${headingId}-days`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-pill text-subtle transition-colors duration-micro ease-guide hover:bg-green-50 hover:text-brand"
                >
                  <span className="sr-only">{range}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-micro ease-guide ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>

            {isOpen && group.dated.length > 0 && (
              <ul
                id={`${headingId}-days`}
                className="divide-y divide-hairline border-t border-hairline bg-surface"
              >
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

      <p className="pt-2 text-center text-micro text-subtle">{t.calendar.endOfList}</p>
    </div>
  );
}
