import { CalendarCategory } from "@/components/site/calendar-category";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/site/controls";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { CalendarEntry } from "@shared/calendar-entries";
import { isoWeekRange, parseCalendarDate } from "@shared/calendar-entries";
import LocationMapLink from "@/components/location-map-link";
import SafeHtml from "@/components/safe-html";
import CalendarSeatMeter from "@/components/calendar-seat-meter";

interface CalendarEntryDetailProps {
  entry: CalendarEntry | null;
  onRegister: (entry: CalendarEntry) => void;
  /** Editor controls, when the viewer may edit this kind of entry. */
  actions?: ReactNode;
  /**
   * Replaces the plain attendee count. Editors get the tooltip that names who
   * is coming; everyone else just sees the number.
   */
  attendeeCount?: ReactNode;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-hairline px-4 py-3 text-small first:border-t-0">
      <dt className="shrink-0 text-subtle">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}

/**
 * One entry in full: what it is, when, where, and what you can do about it.
 *
 * The same content whether it is docked beside the calendar on a wide screen
 * or slid in over it on a narrow one, so a parent comparing two dates never
 * loses the list behind a modal.
 */
export default function CalendarEntryDetail({
  entry,
  onRegister,
  actions,
  attendeeCount,
}: CalendarEntryDetailProps) {
  const { language, t } = useLanguage();

  if (!entry) {
    return (
      <p className="px-4 py-10 text-center text-small text-subtle">
        {t.calendar.detailEmpty}
      </p>
    );
  }

  const style = KIND_STYLE[entry.displayKind];
  const date = entry.date ? parseCalendarDate(entry.date) : null;
  const time = entry.startTime
    ? entry.endTime
      ? `${entry.startTime}–${entry.endTime}`
      : entry.startTime
    : "";

  const when = date
    ? [
        formatDate(date, language, { weekday: "long", day: "numeric", month: "long" }),
        time,
      ]
        .filter(Boolean)
        .join(" · ")
    : (() => {
        const { start, end } = isoWeekRange(entry.weekYear, entry.week);
        const span = entry.weekEnd > entry.week ? `–${entry.weekEnd}` : "";
        return `${t.calendar.week} ${entry.week}${span} · ${formatDate(start, language, {
          day: "numeric",
          month: "short",
        })} – ${formatDate(end, language, { day: "numeric", month: "short" })}`;
      })();

  const signup = entry.signup;

  return (
    <div className="space-y-4">
      {/* The one surface that belongs to a single entry, so it may carry that
          entry's colour as a wash rather than only as a dot. */}
      <div className={`border-l-4 px-5 pb-6 pt-6 ${style.tint} ${style.bar}`}>
        <span
          className={`inline-flex items-center gap-2 rounded-pill bg-surface/80 px-2.5 py-1 text-micro font-semibold ${style.text}`}
        >
          <CalendarCategory kind={entry.displayKind} />
        </span>
        {entry.entry?.entryType === "closed" && <span className="ml-2"><StatusPill tone="warn">{t.yearlyCalendar.closedBadge}</StatusPill></span>}
        <h2
          className={`mt-3 text-h2 font-bold leading-tight tracking-tight text-ink ${
            entry.cancelled ? "line-through" : ""
          }`}
        >
          {entry.title}
        </h2>
        <p className="mt-2 text-small text-copy">{when}</p>
        {entry.cancelled && (
          <p className="mt-3">
            <StatusPill tone="warn">{t.events.cancelled2}</StatusPill>
          </p>
        )}
      </div>

      <div className="space-y-5 px-5 pb-6">
      {entry.description ? (
        <SafeHtml html={entry.description} className="measure text-small text-copy" />
      ) : (
        <p className="text-small italic text-subtle">{t.calendar.noDescription}</p>
      )}

      <dl className="rounded-card border border-hairline">
        {entry.location && <Fact label={t.calendar.detailPlace}>{entry.location}</Fact>}
        <Fact label={t.calendar.detailWeek}>
          <span className="tabular-nums">
            {entry.week}
            {entry.weekEnd > entry.week ? `–${entry.weekEnd}` : ""}
          </span>
        </Fact>
        {signup?.deadline && (
          <Fact label={t.calendar.detailDeadline}>
            {formatDate(signup.deadline, language, {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Fact>
        )}
        {signup?.mode === "vigilo" && <Fact label={t.calendar.detailSignup}>{t.events.registerVigilo}</Fact>}
        {signup?.mode === "none" && <Fact label={t.calendar.detailSignup}>{t.events.noSignupRequired}</Fact>}
        {signup?.mode === "internal" && <Fact label={t.calendar.detailSignup}>{t.events.internalEvent}</Fact>}
      </dl>

      {signup?.mode === "registration" && signup.maxAttendees !== null && (
        <div className={`rounded-card p-4 ${style.tint}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
              {t.events.registered}
            </span>
            {attendeeCount}
          </div>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-h2 font-bold tabular-nums tracking-tight text-ink">
              {signup.currentAttendees}
            </span>
            <span className="text-small tabular-nums text-subtle">/ {signup.maxAttendees}</span>
          </p>
          <div className="mt-3">
            <CalendarSeatMeter
              taken={signup.currentAttendees}
              total={signup.maxAttendees}
              fill={style.dot}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {signup?.mode === "registration" && !entry.cancelled && (
          <Button
            size="sm"
            onClick={() => onRegister(entry)}
            disabled={!signup.isOpen}
            variant={signup.isOpen ? "default" : "outline"}
          >
            {signup.isFull
              ? t.events.full
              : signup.deadlinePassed
                ? t.events.registrationClosed
                : t.events.register}
          </Button>
        )}
        {/* The map link resolves a known address, so it needs the event's own
            two location fields rather than the merged label. */}
        {entry.event?.location && (
          <LocationMapLink
            location={entry.event.location}
            customLocation={entry.event.customLocation ?? undefined}
          />
        )}
      </div>

      {actions}
      </div>
    </div>
  );
}
