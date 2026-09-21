import { useEffect, useState } from "react";

/**
 * Whether a CSS media query currently matches, kept in sync as the viewport
 * changes. For layout that cannot be expressed in CSS alone — a detail panel
 * that docks beside the calendar on a wide screen but slides in over it on a
 * narrow one, where the two are different components rather than one styled
 * two ways.
 *
 * Prefer a Tailwind breakpoint class wherever plain CSS can do the job.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}
