interface CalendarSeatMeterProps {
  taken: number;
  total: number;
  /** Tailwind background for a taken block; defaults to the brand colour. */
  fill?: string;
}

// Ten blocks reads as "roughly this full" at a glance without anyone doing
// arithmetic, and stays legible at panel width. More blocks turn into a bar.
const BLOCKS = 10;

/**
 * How full a signup is, as discrete blocks rather than a continuous bar.
 *
 * A dugnad with 14 of 30 places is a countable thing, and blocks say so: taken
 * places are solid, the remaining ones are dashed outlines you can still see,
 * which is the point — an empty bar looks like nothing left to do, a row of
 * dashed blocks looks like room for you.
 */
export default function CalendarSeatMeter({ taken, total, fill }: CalendarSeatMeterProps) {
  if (total <= 0) return null;

  const ratio = Math.min(1, Math.max(0, taken / total));
  // Never round a partly-full signup down to nothing, or up to full.
  const filled =
    ratio === 0 ? 0 : ratio === 1 ? BLOCKS : Math.min(BLOCKS - 1, Math.max(1, Math.round(ratio * BLOCKS)));

  return (
    <div className="flex gap-1" aria-hidden="true">
      {Array.from({ length: BLOCKS }, (_, index) => (
        <span
          key={index}
          className={`h-6 flex-1 rounded-md ${
            index < filled
              ? (fill ?? "bg-primary/80")
              : "border border-dashed border-hairline"
          }`}
        />
      ))}
    </div>
  );
}
