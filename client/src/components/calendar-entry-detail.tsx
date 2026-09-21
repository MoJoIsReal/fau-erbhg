import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { CalendarEntry } from "@shared/calendar-entries";
import { isoWeekRange, parseCalendarDate } from "@shared/calendar-entries";
import LocationMapLink from "@/components/location-map-link";
import SafeHtml from "@/components/safe-html";

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
    <div className="flex items-baseline justify-between gap-4 border-t border-neutral-100 px-3 py-2 text-sm first:border-t-0 dark:border-neutral-900">
      <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="min-w-0 text-right text-neutral-900 dark:text-neutral-50">{children}</dd>
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
      <p className="px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {t.calendar.detailEmpty}
      </p>
    );
  }

  const style = KIND_STYLE[entry.kind];
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
    <div className="space-y-4 p-5">
      <div className={`border-l-2 pl-3 ${style.bar}`}>
        <span className={`text-xs font-medium uppercase tracking-[0.1em] ${style.text}`}>
          {t.calendar.kinds[entry.kind]}
        </span>
        <h2
          className={`mt-0.5 font-heading text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 ${
            entry.cancelled ? "line-through" : ""
          }`}
        >
          {entry.title}
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{when}</p>
        {entry.cancelled && (
          <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-300">{t.events.cancelled2}</p>
        )}
      </div>

      {entry.description ? (
        <SafeHtml
          html={entry.description}
          className="text-sm text-neutral-700 dark:text-neutral-200"
        />
      ) : (
        <p className="text-sm italic text-neutral-500 dark:text-neutral-400">{t.calendar.noDescription}</p>
      )}

      <dl className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        {entry.location && <Fact label={t.calendar.detailPlace}>{entry.location}</Fact>}
        <Fact label={t.calendar.detailWeek}>
          <span className="tabular-nums">
            {entry.week}
            {entry.weekEnd > entry.week ? `–${entry.weekEnd}` : ""}
          </span>
        </Fact>
        {signup?.mode === "registration" && signup.maxAttendees !== null && (
          <Fact label={t.events.registered}>
            {attendeeCount ?? (
              <span className="tabular-nums">
                {signup.currentAttendees}/{signup.maxAttendees}
              </span>
            )}
          </Fact>
        )}
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
  );
}
