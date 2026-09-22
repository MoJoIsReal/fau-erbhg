import type { CalendarDisplayKind } from "@shared/calendar-entries";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import { useLanguage } from "@/contexts/LanguageContext";
import { StatusPill } from "@/components/site/controls";

/** The same label and colour in the editor, homepage and all calendar views. */
export function CalendarCategory({ kind }: { kind: CalendarDisplayKind }) {
  const { t } = useLanguage();
  if (kind === "stengt") return <StatusPill tone="warn">{t.yearlyCalendar.closedBadge}</StatusPill>;
  const style = KIND_STYLE[kind];
  const labels = { ...t.calendar.kinds, ...t.entryEditor.categories };
  return (
    <span className={`inline-flex items-center gap-2 text-micro font-semibold ${style.text}`}>
      <span className={`h-2 w-2 shrink-0 rounded-pill ${style.dot}`} aria-hidden="true" />
      {labels[kind]}
    </span>
  );
}
