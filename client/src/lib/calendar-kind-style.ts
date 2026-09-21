import type { CalendarEntryKind } from "@shared/calendar-entries";

/**
 * Colour per calendar kind — as a signal, not a surface.
 *
 * Ten kinds is a lot of hues, and the first version spent them badly: every
 * row got a tinted fill, a coloured border and a coloured stripe at once, so a
 * normal week rendered as a wall of highlighter. Colour now appears as a small
 * dot, and as the colour of the little kind label beside it. Rows themselves
 * stay on the neutral surface and are separated by hairlines, which is what
 * lets the titles be the thing you actually read.
 *
 * `bar` is the one place a kind still paints an edge: the left rule of the
 * detail panel's header, where there is exactly one of them on screen.
 */
export type CalendarKindStyle = {
  /** Background for the 8px dot that carries the kind. */
  dot: string;
  /** Text colour for the small kind label; ≥4.5:1 on both surfaces. */
  text: string;
  /** Left rule, used only where a single entry is the whole view. */
  bar: string;
};

export const KIND_STYLE: Record<CalendarEntryKind, CalendarKindStyle> = {
  arrangement: {
    dot: "bg-orange-600 dark:bg-orange-400",
    text: "text-orange-700 dark:text-orange-300",
    bar: "border-l-orange-600 dark:border-l-orange-400",
  },
  mote: {
    dot: "bg-cyan-700 dark:bg-cyan-400",
    text: "text-cyan-800 dark:text-cyan-300",
    bar: "border-l-cyan-700 dark:border-l-cyan-400",
  },
  dugnad: {
    dot: "bg-emerald-700 dark:bg-emerald-400",
    text: "text-emerald-800 dark:text-emerald-300",
    bar: "border-l-emerald-700 dark:border-l-emerald-400",
  },
  foto: {
    dot: "bg-violet-600 dark:bg-violet-400",
    text: "text-violet-700 dark:text-violet-300",
    bar: "border-l-violet-600 dark:border-l-violet-400",
  },
  internt: {
    dot: "bg-slate-500 dark:bg-slate-400",
    text: "text-slate-600 dark:text-slate-300",
    bar: "border-l-slate-500 dark:border-l-slate-400",
  },
  bhgdag: {
    dot: "bg-blue-600 dark:bg-blue-400",
    text: "text-blue-700 dark:text-blue-300",
    bar: "border-l-blue-600 dark:border-l-blue-400",
  },
  varmmat: {
    dot: "bg-amber-600 dark:bg-amber-400",
    text: "text-amber-700 dark:text-amber-300",
    bar: "border-l-amber-600 dark:border-l-amber-400",
  },
  temauke: {
    dot: "bg-indigo-600 dark:bg-indigo-400",
    text: "text-indigo-700 dark:text-indigo-300",
    bar: "border-l-indigo-600 dark:border-l-indigo-400",
  },
  stengt: {
    dot: "bg-red-600 dark:bg-red-400",
    text: "text-red-700 dark:text-red-300",
    bar: "border-l-red-600 dark:border-l-red-400",
  },
  beskjed: {
    dot: "bg-stone-500 dark:bg-stone-400",
    text: "text-stone-600 dark:text-stone-300",
    bar: "border-l-stone-500 dark:border-l-stone-400",
  },
};

/** The dot on its own, for a row that carries no kind label. */
export function kindDot(kind: CalendarEntryKind, className = "") {
  return `${KIND_STYLE[kind].dot} ${className}`;
}
