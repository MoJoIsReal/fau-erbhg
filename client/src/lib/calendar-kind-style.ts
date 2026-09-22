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
 * The values come from the design guide's category table (§7) by way of the
 * `--cat-*` tokens in index.css: the published hue drives the dot, an
 * AA-contrast sibling drives the label text, and a near-white wash is used
 * only where a surface belongs to exactly one entry. The dot never travels
 * alone — every use here is paired with the kind's name, because colour on
 * its own is not an accessible category (§7, rule 10).
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

// Written out rather than generated from the kind name: Tailwind scans this
// file for literal class strings, and a template literal would leave every
// one of these utilities out of the stylesheet.
export const KIND_STYLE: Record<CalendarEntryKind, CalendarKindStyle> = {
  family: {
    dot: "bg-cat-family-dot",
    text: "text-cat-family-text",
    bar: "border-l-cat-family-dot",
    tint: "bg-cat-family-tint",
  },
  arrangement: {
    dot: "bg-cat-arrangement-dot",
    text: "text-cat-arrangement-text",
    bar: "border-l-cat-arrangement-dot",
    tint: "bg-cat-arrangement-tint",
  },
  mote: {
    dot: "bg-cat-mote-dot",
    text: "text-cat-mote-text",
    bar: "border-l-cat-mote-dot",
    tint: "bg-cat-mote-tint",
  },
  dugnad: {
    dot: "bg-cat-dugnad-dot",
    text: "text-cat-dugnad-text",
    bar: "border-l-cat-dugnad-dot",
    tint: "bg-cat-dugnad-tint",
  },
  foto: {
    dot: "bg-cat-foto-dot",
    text: "text-cat-foto-text",
    bar: "border-l-cat-foto-dot",
    tint: "bg-cat-foto-tint",
  },
  internt: {
    dot: "bg-cat-internt-dot",
    text: "text-cat-internt-text",
    bar: "border-l-cat-internt-dot",
    tint: "bg-cat-internt-tint",
  },
  bhgdag: {
    dot: "bg-cat-bhgdag-dot",
    text: "text-cat-bhgdag-text",
    bar: "border-l-cat-bhgdag-dot",
    tint: "bg-cat-bhgdag-tint",
  },
  varmmat: {
    dot: "bg-cat-varmmat-dot",
    text: "text-cat-varmmat-text",
    bar: "border-l-cat-varmmat-dot",
    tint: "bg-cat-varmmat-tint",
  },
  temauke: {
    dot: "bg-cat-temauke-dot",
    text: "text-cat-temauke-text",
    bar: "border-l-cat-temauke-dot",
    tint: "bg-cat-temauke-tint",
  },
  stengt: {
    dot: "bg-cat-stengt-dot",
    text: "text-cat-stengt-text",
    bar: "border-l-cat-stengt-dot",
    tint: "bg-cat-stengt-tint",
  },
  beskjed: {
    dot: "bg-cat-beskjed-dot",
    text: "text-cat-beskjed-text",
    bar: "border-l-cat-beskjed-dot",
    tint: "bg-cat-beskjed-tint",
  },
  info: {
    dot: "bg-cat-info-dot",
    text: "text-cat-info-text",
    bar: "border-l-cat-info-dot",
    tint: "bg-cat-info-tint",
  },
};

/** The dot on its own, for a row that carries no kind label. */
export function kindDot(kind: CalendarEntryKind, className = "") {
  return `${KIND_STYLE[kind].dot} ${className}`;
}
