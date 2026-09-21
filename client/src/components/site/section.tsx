import type { ElementType, ReactNode } from "react";

interface SectionHeaderProps {
  title: ReactNode;
  /** One sentence at most — the section's own standfirst. */
  description?: ReactNode;
  /** "Se alle …" and friends. Sits opposite the title on wide screens. */
  action?: ReactNode;
  /** h2 by default; drop to h3 when the section sits inside another one. */
  as?: "h2" | "h3";
  id?: string;
}

/**
 * The title line of a content section.
 *
 * Kept as its own component because the alternative — a heading and a "see
 * all" link hand-laid on every page — is exactly how sections drift out of
 * alignment with one another.
 */
export function SectionHeader({
  title,
  description,
  action,
  as: Heading = "h2",
  id,
}: SectionHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <Heading id={id} className="text-h2 font-bold tracking-tight text-ink">
          {title}
        </Heading>
        {description && <p className="measure mt-2 text-copy">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface SectionProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}

/** A top-level band of a page. Spacing between them comes from the parent. */
export function Section({ children, className = "", as: Tag = "section", ...rest }: SectionProps) {
  return (
    <Tag className={className} {...rest}>
      {children}
    </Tag>
  );
}

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  /** For a surface that reports something, e.g. "status" or "alert". */
  role?: string;
  "aria-busy"?: boolean;
  "aria-live"?: "polite" | "assertive" | "off";
  /**
   * quiet — a bordered card on the page ground (the default)
   * raised — the same, with the guide's card shadow, for something that
   *          should read as the one thing on the screen
   * inset  — a tinted panel with no border, for grouping inside a card
   */
  tone?: "quiet" | "raised" | "inset";
  as?: ElementType;
}

/**
 * The card surface.
 *
 * The guide is emphatic that cards are not the default container: use
 * spacing and type first, and reach for a surface only when something needs
 * separating from what surrounds it (§9, "Korttetthet").
 */
export function Surface({
  children,
  className = "",
  tone = "quiet",
  as: Tag = "div",
  ...rest
}: SurfaceProps) {
  const tones = {
    quiet: "bg-surface border border-hairline",
    raised: "bg-surface border border-hairline shadow-card",
    inset: "bg-green-50",
  } as const;
  return (
    <Tag className={`rounded-card ${tones[tone]} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Set for a failure rather than an absence, so it is announced. */
  isError?: boolean;
}

/** Nothing here yet — said calmly, and in the same shape every time. */
export function EmptyState({ icon, title, description, action, isError = false }: EmptyStateProps) {
  return (
    <div
      role={isError ? "alert" : undefined}
      className="rounded-card border border-dashed border-hairline bg-surface px-6 py-12 text-center"
    >
      {icon && (
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-pill bg-green-50 text-brand">
          {icon}
        </div>
      )}
      <p className="text-h4 font-semibold text-ink">{title}</p>
      {description && <p className="measure mx-auto mt-2 text-small text-subtle">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
