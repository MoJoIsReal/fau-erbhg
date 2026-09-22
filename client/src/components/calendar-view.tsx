import { CalendarCategory } from "@/components/site/calendar-category";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { CalendarEntry } from "@shared/calendar-entries";
import { compareSpanningEntries, isoWeekRange, isoWeekYear } from "@shared/calendar-entries";
import {
  CALENDAR_DAYS_PER_WEEK,
  toCalendarIsoDate,
  weeksOfMonth,
  isoWeek,
} from "@shared/yearly-calendar-display";
import SafeHtml from "@/components/safe-html";
import { StatusPill } from "@/components/site/controls";
import { EditorSurface } from "@/components/site/cards";
import { Input } from "@/components/ui/input";
import type { EntryDraft } from "@/components/yearly-calendar-entry-modal";
import { Surface } from "@/components/site/section";

export type MonthCursor = { year: number; month: number };

interface CalendarViewProps {
  entries: CalendarEntry[];
  month: MonthCursor;
  onMonthChange: (month: MonthCursor) => void;
  onRegister: (entry: CalendarEntry) => void;
  onCreate?: (initial: Partial<EntryDraft>) => void;
  editorActionsFor?: (entry: CalendarEntry) => ReactNode;
}

const MAX_PER_CELL = 3;

/** "hele uken" is written mid-sentence in i18n, but opens a line here. */
const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What the panel under the grid is showing: one day, or one week's bands. */
type Selection =
  | { kind: "day"; iso: string }
  | { kind: "week"; weekYear: number; week: number };

/** A week-spanning entry as it is drawn on one week row. */
type WeekBand = {
  entry: CalendarEntry;
  /** 1-7, Monday through Sunday, both inclusive. */
  startColumn: number;
  endColumn: number;
  /** The entry began in an earlier week, or runs on into a later one. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * The month as a grid, with the picked day written out beside it.
 *
 * A cell has room for a dot and a few words, which is enough to see that
 * something is there but never enough to act on. Rather than cram the detail
 * in — or throw a panel over the grid you just navigated to — the day you pick
 * opens in a column of its own, where there is room for the time, the place
 * and the signup (guide §10B).
 *
 * From 1280px that column sits to the right of the grid and sticks as you
 * scroll, so picking a day changes something you are already looking at. It
 * used to open underneath, where on a tall month it landed below the fold and
 * people did not notice it had opened at all. The column is always rendered
 * once it fits, holding a short prompt when nothing is picked, so the grid
 * does not resize under the pointer every time a day is selected or cleared.
 * Narrower than that there is no room beside a seven-column grid, so the
 * panel stays underneath — and scrolls itself into view instead.
 *
 * What lasts a whole week — the hot meal, a temauke, a notice — has no day of
 * its own, so it is drawn as a band across the top of its week row, over the
 * days it covers, and opens the week rather than a day. The grid used to put
 * those in Monday's cell, which read as Monday being a very busy day.
 *
 * Below 640px the grid shows dots, with the readable agenda under the picked day.
 */
export default function CalendarView({
  entries,
  month,
  onMonthChange,
  onRegister,
  editorActionsFor,
  onCreate,
}: CalendarViewProps) {
  const { language, t } = useLanguage();
  const todayIso = toCalendarIsoDate(new Date());
  const [selected, setSelected] = useState<Selection | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const weeks = useMemo(() => weeksOfMonth(month.year, month.month), [month.year, month.month]);

  // Only a dated entry can sit in a day cell. A temauke or the week's hot
  // meal belongs to the whole week, and the week row draws it as a band.
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

  // Each week row with the bands crossing it: the columns they cover, and
  // whether they run on past either edge of the week.
  const weekRows = useMemo(
    () =>
      weeks.map((week) => {
        const weekYear = isoWeekYear(week.days[0].date);
        const bands: WeekBand[] = entries
          .filter(
            (entry) =>
              !entry.date &&
              entry.weekYear === weekYear &&
              week.weekNumber >= entry.week &&
              week.weekNumber <= entry.weekEnd,
          )
          .sort(compareSpanningEntries)
          .map((entry) => {
            const continuesBefore = week.weekNumber > entry.week;
            const continuesAfter = week.weekNumber < entry.weekEnd;
            // A weekday range is honoured only when both ends are set and in
            // order — half a range would draw an edge the entry never stated.
            const from = entry.weekdayStart;
            const to = entry.weekdayEnd;
            const ranged =
              from !== null &&
              to !== null &&
              from >= 1 &&
              to <= CALENDAR_DAYS_PER_WEEK &&
              from <= to;

            return {
              entry,
              startColumn: ranged && !continuesBefore ? (from ?? 1) : 1,
              endColumn:
                ranged && !continuesAfter ? (to ?? CALENDAR_DAYS_PER_WEEK) : CALENDAR_DAYS_PER_WEEK,
              continuesBefore,
              continuesAfter,
            };
          });

        return { week, weekYear, bands };
      }),
    [entries, weeks],
  );

  // Below the two-column breakpoint the panel opens under the grid, which on a
  // tall month can be past the fold — the whole reason it moved beside the
  // grid in the first place. Bring it into view there, honouring the reader's
  // motion preference. `block: "nearest"` so a panel already on screen does
  // not jump.
  useEffect(() => {
    if (!selected) return;
    const panel = detailRef.current;
    if (!panel || window.matchMedia("(min-width: 1280px)").matches) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
  }, [selected]);

  const step = (direction: -1 | 1) => {
    setSelected(null);
    setExpanded(new Set());
    const next = new Date(month.year, month.month - 1 + direction, 1);
    onMonthChange({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  const goToday = () => {
    const now = new Date();
    setExpanded(new Set());
    onMonthChange({ year: now.getFullYear(), month: now.getMonth() + 1 });
    setSelected({ kind: "day", iso: todayIso });
  };

  const weekdayNames =
    weeks[0]?.days.map((day) => ({
      long: formatDate(day.date, language, { weekday: "long" }),
      short: formatDate(day.date, language, { weekday: "short" }),
      narrow: formatDate(day.date, language, { weekday: "narrow" }),
    })) ?? [];
  const selectedWeek =
    selected?.kind === "week"
      ? (weekRows.find(
          (row) => row.weekYear === selected.weekYear && row.week.weekNumber === selected.week,
        ) ?? null)
      : null;
  const selectedEntries =
    selected?.kind === "day"
      ? (byDate.get(selected.iso) ?? [])
      : (selectedWeek?.bands.map((band) => band.entry) ?? []);

  // "Uke 38 · 14. – 20. september", the range the list view already writes.
  const weekHeading = (weekYear: number, week: number) => {
    const { start, end } = isoWeekRange(weekYear, week);
    const sameMonth = start.getMonth() === end.getMonth();
    const range = `${start.getDate()}.${
      sameMonth ? "" : ` ${formatDate(start, language, { month: "long" })}`
    } – ${end.getDate()}. ${formatDate(end, language, { month: "long" })}`;
    return `${t.calendar.week} ${week} · ${range}`;
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <Surface className="overflow-hidden">
        {/* The month nav wraps on a narrow phone rather than squeezing
            "September 2026" into an ellipsis next to two chevrons. */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-pill"
              onClick={() => step(-1)}
              aria-label={t.events.previousMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="min-w-0 flex-1 text-h4 font-bold capitalize text-ink">
              {formatDate(new Date(month.year, month.month - 1, 1), language, {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-pill"
              onClick={() => step(1)}
              aria-label={t.events.nextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="rounded-pill" onClick={goToday}>
            {t.events.today}
          </Button>
        </div>

        <label className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-3 text-small font-semibold text-copy">
          {t.calendarWorkspace.jumpMonth}
          <Input type="month" className="w-auto max-w-full" min="2020-08" max="2100-07"
            value={`${month.year}-${String(month.month).padStart(2, "0")}`}
            onChange={(event) => {
              const [year, value] = event.target.value.split("-").map(Number);
              if (year >= 2020 && year <= 2100 && value >= 1 && value <= 12) {
                setSelected(null);
                setExpanded(new Set());
                onMonthChange({ year, month: value });
              }
            }} />
        </label>
        <div className="border-t border-hairline">
          {/* Week number in its own narrow rail from tablet up: the whole
              kindergarten year is spoken about in week numbers, so the grid
              should let you find "uke 38" without counting. */}
          <div className="grid grid-cols-7 border-b border-calendar-grid bg-surface-soft sm:grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
            <div className="hidden items-center justify-center py-3 text-label font-semibold uppercase tracking-[0.1em] text-subtle sm:flex">
              {t.calendar.week}
            </div>
            {weekdayNames.map((name, index) => (
              <div
                key={index}
                className="py-3 text-center text-micro font-semibold uppercase tracking-[0.06em] text-subtle sm:px-3 sm:text-left sm:text-body sm:normal-case sm:tracking-normal"
              >
                <span className="sm:hidden" aria-hidden="true">
                  {name.narrow}
                </span>
                <span className="hidden capitalize sm:inline" aria-hidden="true">
                  {name.short}
                </span>
                <span className="sr-only">{name.long}</span>
              </div>
            ))}
          </div>

          {weekRows.map((row, weekIndex) => {
            const week = row.week;
            const weekSelected =
              selected?.kind === "week" &&
              selected.weekYear === row.weekYear &&
              selected.week === week.weekNumber;

            return (
              <div
                key={`${row.weekYear}-${week.weekNumber}`}
                className={`flex ${weekIndex > 0 ? "border-t border-calendar-grid" : ""}`}
              >
                <div className="hidden w-12 shrink-0 border-r border-calendar-grid bg-surface-soft sm:block">
                  <button type="button" className="min-h-11 w-full text-small font-semibold tabular-nums text-subtle hover:bg-calendar-hover"
                    aria-label={weekHeading(row.weekYear, week.weekNumber)} aria-pressed={weekSelected}
                    onClick={() => setSelected({ kind: "week", weekYear: row.weekYear, week: week.weekNumber })}>
                    {week.weekNumber}
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  {/* What lasts all week is drawn across the week, over the
                      days it covers: the hot meal, a temauke, a notice.
                      Stacked in Monday's cell they read as five things
                      happening on Monday, which is not what the årskalender
                      says. */}
                  {row.bands.length > 0 && (
                    <div className="grid grid-cols-7 gap-y-1 border-b border-calendar-grid bg-calendar-cell px-1 py-1.5 sm:px-2 sm:py-2">
                      {row.bands.map((band, bandIndex) => {
                        const style = KIND_STYLE[band.entry.displayKind];

                        return (
                          <button
                            key={band.entry.id}
                            type="button"
                            onClick={() =>
                              setSelected(
                                weekSelected
                                  ? null
                                  : { kind: "week", weekYear: row.weekYear, week: week.weekNumber },
                              )
                            }
                            title={band.entry.title}
                            style={{
                              gridColumn: `${band.startColumn} / ${band.endColumn + 1}`,
                              gridRow: `${bandIndex + 1}`,
                            }}
                            className={`flex min-h-11 min-w-0 items-center gap-1.5 rounded-token px-2 py-1 text-left text-micro font-semibold transition-shadow duration-micro ease-guide hover:ring-2 hover:ring-brand/30 ${
                              style.tint
                            } ${style.text} ${weekSelected ? "ring-2 ring-brand/50" : ""}`}
                          >
                            {band.continuesBefore && (
                              <ChevronLeft className="h-3 w-3 shrink-0" aria-hidden="true" />
                            )}
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-pill ${style.dot}`}
                              aria-hidden="true"
                            />
                            <span className="truncate">{band.entry.title}</span>
                            {/* The width says "all week" to the eye; this says
                                it, and the category, to a screen reader. */}
                            <span className="sr-only">
                              {" "}
                              — {{ ...t.calendar.kinds, ...t.entryEditor.categories }[band.entry.displayKind]}, {t.calendar.allWeek}
                            </span>
                            {band.continuesAfter && (
                              <ChevronRight className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-7">
                  {week.days.map((day) => {
                    const iso = toCalendarIsoDate(day.date);
                    const dayEntries = byDate.get(iso) ?? [];
                    const isToday = iso === todayIso;
                    const isSelected = selected?.kind === "day" && selected.iso === iso;
                    const open = expanded.has(iso);
                    const shown = open ? dayEntries : dayEntries.slice(0, MAX_PER_CELL);

                    return (
                      <div
                        key={iso}
                        className={`min-h-[68px] px-0 py-2 transition-colors duration-micro ease-guide sm:min-h-[132px] sm:px-2.5 sm:py-2.5 ${
                          isSelected
                            ? "bg-green-50"
                            : day.inMonth
                              ? "bg-calendar-cell hover:bg-calendar-hover"
                              : "bg-calendar-outside"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelected(isSelected ? null : { kind: "day", iso })}
                          aria-pressed={isSelected}
                          className="mx-auto flex min-h-11 w-full items-center justify-center sm:mx-0 sm:w-11"
                        >
                          <span className="sr-only">
                            {formatDate(day.date, language, {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}
                            {dayEntries.length > 0 ? ` — ${dayEntries.length}` : ""}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`grid h-9 w-9 place-items-center rounded-pill text-body tabular-nums transition-colors duration-micro ease-guide ${
                              isToday
                                ? "bg-brand font-bold text-primary-foreground shadow-[0_0_0_3px_var(--color-green-50)]"
                                : isSelected
                                  ? "bg-green-50 font-bold text-brand ring-2 ring-brand/50"
                                  : day.inMonth
                                    ? "font-semibold text-ink"
                                    : "font-normal text-subtle"
                            }`}
                          >
                            {day.date.getDate()}
                          </span>
                        </button>

                        {/* Phone: dots only. The agenda under the grid does the
                            reading, which is what keeps the month usable at
                            375px without sideways scrolling (guide §15). */}
                        {dayEntries.length > 0 && (
                          <div
                            className="mt-1 flex justify-center gap-0.5 sm:hidden"
                            aria-hidden="true"
                          >
                            {dayEntries.slice(0, MAX_PER_CELL).map((entry) => (
                              <span
                                key={`dot-${entry.id}`}
                                className={`h-1.5 w-1.5 rounded-pill ${KIND_STYLE[entry.displayKind].dot}`}
                              />
                            ))}
                          </div>
                        )}

                        <div className="mt-1 hidden flex-col gap-1 sm:flex">
                          {shown.map((entry) => (
                            <button
                              key={`${iso}-${entry.id}`}
                              type="button"
                              onClick={() => setSelected({ kind: "day", iso })}
                              title={entry.title}
                              className="flex min-h-11 items-center gap-1.5 rounded-sm text-left text-micro leading-snug text-copy hover:text-brand"
                            >
                              <span
                                className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-pill ${
                                  KIND_STYLE[entry.displayKind].dot
                                }`}
                                aria-hidden="true"
                              />
                              <span
                                className={`truncate ${entry.cancelled ? "line-through decoration-1" : ""}`}
                              >
                                {entry.title}
                              </span>
                            </button>
                          ))}
                          {!open && dayEntries.length > MAX_PER_CELL && (
                            <button
                              type="button"
                              onClick={() => setExpanded((prev) => new Set(prev).add(iso))}
                              className="min-h-11 text-left text-micro font-semibold text-subtle hover:text-brand"
                            >
                              +{dayEntries.length - MAX_PER_CELL} {t.events.more}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Surface>

      {/* Sticky under the site header from the breakpoint where the column
          exists, so the day you picked stays put while you keep scanning the
          month. `top` clears the header's own height. */}
      <div ref={detailRef} className="xl:sticky xl:top-24">
        {selected ? (
          <Surface className="p-5 sm:p-6" as="section" aria-live="polite">
            <h3
              className={`text-h4 font-bold text-ink ${selected.kind === "day" ? "capitalize" : ""}`}
            >
              {selected.kind === "day"
                ? formatDate(new Date(selected.iso), language, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : weekHeading(selected.weekYear, selected.week)}
            </h3>

            {onCreate && (
              <div className="mt-4">
                <EditorSurface label={t.calendar.editorLabel}>
                  {selected.kind === "day" && (
                    <Button size="sm" onClick={() => onCreate({
                      entryType: "day_event", date: selected.iso,
                      year: Number(selected.iso.slice(0, 4)), month: Number(selected.iso.slice(5, 7)),
                    })}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{t.calendarWorkspace.addDay}</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => {
                    const date = selected.kind === "day" ? new Date(`${selected.iso}T12:00:00`) : null;
                    onCreate({ entryType: "week_event", year: date?.getFullYear() ?? month.year,
                      month: date ? date.getMonth() + 1 : month.month,
                      weekNumber: date ? isoWeek(date) : selected.kind === "week" ? selected.week : null });
                  }}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />{t.calendarWorkspace.addWeek}</Button>
                </EditorSurface>
              </div>
            )}

            {selectedEntries.length === 0 ? (
              <p className="mt-3 text-small text-subtle">
                {selected.kind === "day" ? t.calendar.noEventsThisDay : t.calendar.noEventsThisWeek}
              </p>
            ) : (
              <div className="mt-5 divide-y divide-hairline">
                {selectedEntries.map((entry) => {
                  const style = KIND_STYLE[entry.displayKind];
                  const time = entry.startTime
                    ? entry.endTime
                      ? `${entry.startTime} – ${entry.endTime}`
                      : entry.startTime
                    : entry.date
                      ? t.calendar.allDay
                      : sentenceCase(t.calendar.allWeek);

                  return (
                    <article key={entry.id} className="space-y-2 py-5 first:pt-0 last:pb-0">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-semibold ${style.tint} ${style.text}`}
                      >
                        <CalendarCategory kind={entry.displayKind} />
                      </span>

                      <h4
                        className={`text-h3 font-bold tracking-tight text-ink ${
                          entry.cancelled ? "line-through decoration-1" : ""
                        }`}
                      >
                        {entry.title}
                      </h4>
                      {entry.cancelled && (
                        <StatusPill tone="warn">{t.events.cancelled2}</StatusPill>
                      )}

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-small text-subtle">
                        <span className="flex items-center gap-1.5 tabular-nums">
                          <Clock className="h-4 w-4" aria-hidden="true" />
                          {time}
                        </span>
                        {/* A band can reach past the week you clicked, so it
                            says how far rather than leaving it to the grid. */}
                        {!entry.date && entry.weekEnd > entry.week && (
                          <span className="tabular-nums">
                            {t.calendar.week} {entry.week}–{entry.weekEnd}
                          </span>
                        )}
                        {entry.location && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" aria-hidden="true" />
                            {entry.location}
                          </span>
                        )}
                      </div>

                      {entry.description && (
                        <SafeHtml html={entry.description} className="measure text-small text-copy" />
                      )}

                      {entry.signup?.mode === "registration" && !entry.cancelled && (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          {entry.signup.maxAttendees !== null && (
                            <span className="text-small tabular-nums text-subtle">
                              {entry.signup.currentAttendees}/{entry.signup.maxAttendees}{" "}
                              {t.events.attendees}
                            </span>
                          )}
                          <Button
                            size="sm"
                            className="rounded-pill"
                            disabled={!entry.signup.isOpen}
                            onClick={() => onRegister(entry)}
                          >
                            {entry.signup.isFull
                              ? t.events.full
                              : entry.signup.deadlinePassed
                                ? t.events.registrationClosed
                                : t.events.register}
                          </Button>
                        </div>
                      )}

                      {editorActionsFor?.(entry)}
                    </article>
                  );
                })}
              </div>
            )}
          </Surface>
        ) : (
          // Only from the two-column breakpoint: stacked, an empty panel under
          // the grid would be a box that says nothing. Beside it, the column
          // has to hold its width or the grid reflows on every click.
          <Surface className="hidden p-5 sm:p-6 xl:block" as="section">
            <p className="text-small text-subtle">{t.calendar.pickADay}</p>
          </Surface>
        )}
      </div>
    </div>
  );
}
