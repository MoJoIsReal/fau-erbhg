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
  /**
   * A very low-saturation wash, for a surface that belongs to exactly one
   * entry — the detail panel and its icon chip. Applied per row it would be
   * the wall of colour this palette exists to avoid.
   */
  tint: string;
};

export const KIND_STYLE: Record<CalendarEntryKind, CalendarKindStyle> = {
  arrangement: {
    dot: "bg-orange-600 dark:bg-orange-400",
    text: "text-orange-700 dark:text-orange-300",
    bar: "border-l-orange-600 dark:border-l-orange-400",
    tint: "bg-orange-50 dark:bg-orange-950/30",
  },
  mote: {
    dot: "bg-cyan-700 dark:bg-cyan-400",
    text: "text-cyan-800 dark:text-cyan-300",
    bar: "border-l-cyan-700 dark:border-l-cyan-400",
    tint: "bg-cyan-50 dark:bg-cyan-950/30",
  },
  dugnad: {
    dot: "bg-emerald-700 dark:bg-emerald-400",
    text: "text-emerald-800 dark:text-emerald-300",
    bar: "border-l-emerald-700 dark:border-l-emerald-400",
    tint: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  foto: {
    dot: "bg-violet-600 dark:bg-violet-400",
    text: "text-violet-700 dark:text-violet-300",
    bar: "border-l-violet-600 dark:border-l-violet-400",
    tint: "bg-violet-50 dark:bg-violet-950/30",
  },
  internt: {
    dot: "bg-slate-500 dark:bg-slate-400",
    text: "text-slate-600 dark:text-slate-300",
    bar: "border-l-slate-500 dark:border-l-slate-400",
    tint: "bg-slate-100 dark:bg-slate-900/50",
  },
  bhgdag: {
    dot: "bg-blue-600 dark:bg-blue-400",
    text: "text-blue-700 dark:text-blue-300",
    bar: "border-l-blue-600 dark:border-l-blue-400",
    tint: "bg-blue-50 dark:bg-blue-950/30",
  },
  varmmat: {
    dot: "bg-amber-600 dark:bg-amber-400",
    text: "text-amber-700 dark:text-amber-300",
    bar: "border-l-amber-600 dark:border-l-amber-400",
    tint: "bg-amber-50 dark:bg-amber-950/30",
  },
  temauke: {
    dot: "bg-indigo-600 dark:bg-indigo-400",
    text: "text-indigo-700 dark:text-indigo-300",
    bar: "border-l-indigo-600 dark:border-l-indigo-400",
    tint: "bg-indigo-50 dark:bg-indigo-950/30",
  },
  stengt: {
    dot: "bg-red-600 dark:bg-red-400",
    text: "text-red-700 dark:text-red-300",
    bar: "border-l-red-600 dark:border-l-red-400",
    tint: "bg-red-50 dark:bg-red-950/30",
  },
  beskjed: {
    dot: "bg-stone-500 dark:bg-stone-400",
    text: "text-stone-600 dark:text-stone-300",
    bar: "border-l-stone-500 dark:border-l-stone-400",
    tint: "bg-stone-100 dark:bg-stone-900/50",
  },
};

/** The dot on its own, for a row that carries no kind label. */
export function kindDot(kind: CalendarEntryKind, className = "") {
  return `${KIND_STYLE[kind].dot} ${className}`;
}
