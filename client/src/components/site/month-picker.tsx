import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";

export type MonthValue = { year: number; month: number };

interface MonthPickerProps {
  label: string;
  value: MonthValue;
  onChange: (next: MonthValue) => void;
  /** Inclusive bounds; a month outside them is shown but cannot be picked. */
  min: MonthValue;
  max: MonthValue;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const COLUMNS = 3;
const ARROW_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS };
const ordinal = ({ year, month }: MonthValue) => year * 12 + month - 1;

/**
 * "Gå til måned": a year you can step through and its twelve months.
 *
 * It replaces `<input type="month">`, whose popup is drawn by the browser —
 * its own font, a system-blue selection and English month names on a
 * Norwegian page — and can't be styled to the guide. This one is built from
 * the same tokens as the rest of the calendar: the field reads like an
 * outline control (§7), the panel is a raised surface (§5), and the picked
 * month is primary green with white text, as the active view is in the
 * segmented control (§11). Today's month keeps a green border so you can find
 * your way back without it looking picked.
 */
export function MonthPicker({ label, value, onChange, min, max }: MonthPickerProps) {
  const { language, t } = useLanguage();
  const labelId = useId();
  const valueId = useId();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(value.year);
  const monthRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const today = new Date();
  const current = ordinal({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const picked = ordinal(value);
  const inRange = (month: number) => {
    const at = ordinal({ year, month });
    return at >= ordinal(min) && at <= ordinal(max);
  };
  const monthName = (month: number, style: "short" | "long") =>
    formatDate(new Date(year, month - 1, 1), language, { month: style });

  const pick = (month: number) => {
    onChange({ year, month });
    setOpen(false);
  };

  // A grid of buttons gets arrow keys, so the twelve months are not twelve tab stops.
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, month: number) => {
    const offset = ARROW_STEP[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const target = month + offset;
    if (target >= 1 && target <= 12) monthRefs.current[target - 1]?.focus();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span id={labelId} className="text-small font-semibold text-copy">
        {label}
      </span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setYear(value.year);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" className="rounded-pill px-4" aria-labelledby={`${labelId} ${valueId}`}>
            <CalendarDays aria-hidden="true" />
            <span id={valueId} className="capitalize">
              {formatDate(new Date(value.year, value.month - 1, 1), language, { month: "long", year: "numeric" })}
            </span>
            <ChevronDown aria-hidden="true" className={`transition-transform duration-micro ease-guide ${open ? "rotate-180" : ""}`} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-labelledby={labelId}
          className="w-[min(20rem,calc(100vw-2rem))] rounded-card border-hairline bg-surface p-3 text-ink shadow-panel"
          onOpenAutoFocus={(event) => {
            const focusTarget = monthRefs.current[value.month - 1];
            if (focusTarget) {
              event.preventDefault();
              focusTarget.focus();
            }
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-pill"
              onClick={() => setYear(year - 1)}
              disabled={year <= min.year}
              aria-label={t.calendarWorkspace.previousYear}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="text-body font-bold tabular-nums" aria-live="polite">
              {year}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-pill"
              onClick={() => setYear(year + 1)}
              disabled={year >= max.year}
              aria-label={t.calendarWorkspace.nextYear}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {MONTHS.map((month) => {
              const at = ordinal({ year, month });
              const isPicked = at === picked;
              const isCurrent = at === current;
              return (
                <button
                  key={month}
                  ref={(node) => {
                    monthRefs.current[month - 1] = node;
                  }}
                  type="button"
                  disabled={!inRange(month)}
                  onClick={() => pick(month)}
                  onKeyDown={(event) => moveFocus(event, month)}
                  aria-pressed={isPicked}
                  aria-current={isCurrent ? "date" : undefined}
                  aria-label={`${monthName(month, "long")} ${year}`}
                  className={`min-h-11 rounded-pill border text-small capitalize transition-colors duration-micro ease-guide focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-55 ${
                    isPicked
                      ? "border-brand bg-brand font-semibold text-primary-foreground"
                      : isCurrent
                        ? "border-brand/40 font-semibold text-brand hover:bg-green-50"
                        : "border-transparent text-ink hover:bg-green-50 hover:text-brand"
                  }`}
                >
                  {monthName(month, "short").replace(/\.$/, "")}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
