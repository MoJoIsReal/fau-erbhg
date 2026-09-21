import { useState, type ReactNode } from "react";
import { ChevronDown, Wrench } from "lucide-react";

interface EditorSurfaceProps {
  children: ReactNode;
  label: string;
  /** Shown beside the label to explain what these controls are for. */
  hint?: string;
  /**
   * Start folded away behind its own label. For a toolbar that sits above
   * public content, where an editor opens it deliberately rather than having
   * it occupy the page for every visit.
   */
  collapsible?: boolean;
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
export function EditorSurface({ children, label, hint, collapsible = false }: EditorSurfaceProps) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      {hint && <p className="mb-3 text-micro text-subtle">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </>
  );

  // Muted surface, dashed edge, its own label — and, where it sits above
  // public content, folded away until an editor asks for it. The guide is
  // explicit that admin tools must never carry more visual weight than what
  // parents came to read (guide v1.1 §21).
  return (
    <section
      aria-label={label}
      className="rounded-card border border-dashed border-hairline bg-muted px-4 py-4 sm:px-5"
    >
      {collapsible ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            aria-expanded={open}
            className="flex min-h-[44px] w-full items-center gap-2 text-left text-micro font-semibold uppercase tracking-[0.14em] text-subtle"
          >
            <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-micro ease-guide ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>
          {open && <div className="pt-3">{body}</div>}
        </>
      ) : (
        <>
          <h2 className="mb-3 text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
            {label}
          </h2>
          {body}
        </>
      )}
    </section>
  );
}
