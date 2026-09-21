import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

interface LinkCardProps {
  href: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** External links open in a new tab and say so to assistive tech. */
  external?: boolean;
  /** Translated "opens in a new tab", read out after the title. */
  externalLabel?: string;
}

/**
 * A useful link: icon, label, one line of explanation, whole card clickable.
 *
 * The card *is* the anchor rather than containing one, so there is a single
 * tab stop and a single focus ring around the thing you are about to open —
 * the pattern the guide asks for in §9, and the one that stops a keyboard
 * reader from hearing the same destination twice.
 */
export function LinkCard({
  href,
  title,
  description,
  icon,
  external = false,
  externalLabel,
}: LinkCardProps) {
  const content = (
    <>
      <span className="flex items-start justify-between gap-3">
        {icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-token bg-green-50 text-brand">
            {icon}
          </span>
        )}
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-subtle transition-transform duration-micro ease-guide group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
          aria-hidden="true"
        />
      </span>
      <span className="mt-4 block font-semibold text-ink group-hover:text-brand">{title}</span>
      {description && <span className="mt-1 block text-small text-subtle">{description}</span>}
      {external && externalLabel && <span className="sr-only"> ({externalLabel})</span>}
    </>
  );

  const className =
    "group flex h-full flex-col rounded-card border border-hairline bg-surface p-5 transition-colors duration-micro ease-guide hover:border-brand/35 hover:bg-green-50/50";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

interface EditorSurfaceProps {
  children: ReactNode;
  label: string;
  /** Shown beside the label to explain what these controls are for. */
  hint?: string;
}

/**
 * The editor's own strip of the page.
 *
 * Admin actions live on a sand-toned bar with its own label, set apart from
 * everything a parent reads — never interleaved with the public filters
 * (guide §11). It is only ever rendered for someone who may use it; hiding
 * the controls is a courtesy, the handler's role check is the actual
 * boundary.
 */
export function EditorSurface({ children, label, hint }: EditorSurfaceProps) {
  return (
    <section
      aria-label={label}
      className="rounded-card border border-dashed border-hairline bg-sand px-4 py-4 sm:px-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
          {label}
        </h2>
        {hint && <p className="text-micro text-subtle">{hint}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}
