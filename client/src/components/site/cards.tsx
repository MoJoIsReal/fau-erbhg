import type { ReactNode } from "react";

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
      className="rounded-card border border-dashed border-hairline bg-muted px-4 py-4 sm:px-5"
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
