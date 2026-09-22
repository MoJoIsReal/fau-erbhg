import type { ReactNode } from "react";
import { Link } from "wouter";

interface FilterChipProps {
  label: string;
  pressed: boolean;
  /**
   * A category's dot colour as a Tailwind class (`bg-cat-mote-dot`). The
   * chip always shows the label too — colour is never the only signal
   * (guide §7).
   */
  dotClass?: string;
  /** Shown after the label, e.g. how many entries the filter would keep. */
  count?: number;
}

type FilterChipAction =
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void };

/**
 * One filter, as a pill you can press.
 *
 * On state is carried three ways at once — a filled surface, a green border
 * and `aria-pressed` (or `aria-current` for links) — so it survives both a colour-blind reader and a
 * screen reader. Off state keeps the label at full contrast rather than
 * greying it into illegibility; it is a choice you can still read, not
 * disabled text.
 */
export function FilterChip({ label, pressed, href, onClick, dotClass, count }: FilterChipProps & FilterChipAction) {
  const className = `inline-flex min-h-11 items-center gap-2 rounded-pill border px-4 text-small transition-colors duration-micro ease-guide ${
    pressed
      ? "border-brand/35 bg-green-50 font-semibold text-brand"
      : "border-hairline bg-surface text-subtle hover:border-brand/30 hover:text-ink"
  }`;
  const content = (
    <>
      {dotClass && (
        <span
          className={`h-2 w-2 shrink-0 rounded-pill ${pressed ? dotClass : "bg-current opacity-40"}`}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
      {typeof count === "number" && (
        <span className="tabular-nums text-micro text-subtle">{count}</span>
      )}
    </>
  );

  // URL-backed filters stay shareable and preserve native link behaviour.
  return href !== undefined ? (
    <Link href={href} aria-current={pressed ? "page" : undefined} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={className}>
      {content}
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}

/**
 * Liste | Måned | År.
 *
 * The active view is primary green with white text, which is the one place
 * the guide asks for a solid green control outside a real call to action
 * (§11). It stays a group of buttons rather than a tab list, because the
 * views are not panels of one tabbed region — each replaces the page's main
 * content and its own URL-independent state.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-pill border border-hairline bg-surface p-1"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-pill px-4 text-small font-semibold transition-colors duration-micro ease-guide ${
              active
                ? "bg-brand text-primary-foreground"
                : "text-subtle hover:bg-green-50 hover:text-ink"
            }`}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface StatusPillProps {
  children: ReactNode;
  /**
   * info    — neutral fact (a week number, a count)
   * now     — "this week", "today": the thing you are looking for
   * warn    — closed, cancelled: act on it
   * signup  — registration is open
   */
  tone?: "info" | "now" | "warn" | "signup";
  className?: string;
}

/** A small, non-interactive state label. Always carries its own words. */
export function StatusPill({ children, tone = "info", className = "" }: StatusPillProps) {
  const tones = {
    info: "bg-green-50 text-brand",
    now: "bg-brand text-primary-foreground",
    warn: "bg-cat-stengt-tint text-cat-stengt-text",
    signup: "bg-peach text-ink",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
