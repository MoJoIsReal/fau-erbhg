import type { CalendarEntryKind } from "@shared/calendar-entries";

/**
 * One colour per calendar kind, shared by the week list, the month grid and
 * the filter chips so a dugnad is the same green wherever it appears.
 *
 * Tailwind classes rather than inline styles, so both themes come from the
 * same place as the rest of the site. `border` is the stripe down the left of
 * a row or chip, `text` the small uppercase kind label, `chip` the filled
 * surface used by filter pills, week-band rows and month-grid entries.
 */
export type CalendarKindStyle = {
  border: string;
  text: string;
  chip: string;
};

export const KIND_STYLE: Record<CalendarEntryKind, CalendarKindStyle> = {
  arrangement: {
    border: "border-l-orange-600 dark:border-l-orange-400",
    text: "text-orange-700 dark:text-orange-300",
    chip: "border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  },
  mote: {
    border: "border-l-cyan-700 dark:border-l-cyan-400",
    text: "text-cyan-800 dark:text-cyan-300",
    chip: "border-cyan-600 bg-cyan-50 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200",
  },
  dugnad: {
    border: "border-l-emerald-700 dark:border-l-emerald-400",
    text: "text-emerald-800 dark:text-emerald-300",
    chip: "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  foto: {
    border: "border-l-violet-600 dark:border-l-violet-400",
    text: "text-violet-700 dark:text-violet-300",
    chip: "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  },
  internt: {
    border: "border-l-slate-500 dark:border-l-slate-400",
    text: "text-slate-700 dark:text-slate-300",
    chip: "border-slate-400 bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200",
  },
  bhgdag: {
    border: "border-l-blue-600 dark:border-l-blue-400",
    text: "text-blue-700 dark:text-blue-300",
    chip: "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  varmmat: {
    border: "border-l-amber-600 dark:border-l-amber-400",
    text: "text-amber-700 dark:text-amber-300",
    chip: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  },
  temauke: {
    border: "border-l-fuchsia-700 dark:border-l-fuchsia-400",
    text: "text-fuchsia-800 dark:text-fuchsia-300",
    chip: "border-fuchsia-600 bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-200",
  },
  stengt: {
    border: "border-l-red-700 dark:border-l-red-400",
    text: "text-red-700 dark:text-red-300",
    chip: "border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  },
  beskjed: {
    border: "border-l-stone-500 dark:border-l-stone-400",
    text: "text-stone-700 dark:text-stone-300",
    chip: "border-stone-400 bg-stone-100 text-stone-800 dark:bg-stone-800/60 dark:text-stone-200",
  },
};

/** A filter chip that is switched off: present, but not competing for attention. */
export const CHIP_OFF =
  "border-neutral-300 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400";
