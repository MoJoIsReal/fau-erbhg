import { useState, type ReactNode } from "react";
import { Download, Plus } from "lucide-react";
import type { Event, YearlyCalendarEntry } from "@shared/schema";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { EditorSurface } from "@/components/site/cards";
import { CalendarCategory } from "@/components/site/calendar-category";
import { yearlyCalendarEntryOverlapsMonth } from "@shared/yearly-calendar-placement";
import { calendarDisplayKindForEntry } from "@shared/calendar-entries";
import type { CalendarEditor } from "@/components/calendar-editor-tools";
import type { MonthCursor } from "@/components/calendar-view";

/** Public exports use complete source rows; filters never remove content from a PDF. */
export default function CalendarMonthTools({ month, schoolYear, entries, editor, showNotes, events, dataReady, hasDataError, extraAction }: {
  month: MonthCursor;
  schoolYear: number;
  entries: YearlyCalendarEntry[];
  editor: CalendarEditor;
  showNotes: boolean;
  events: Event[];
  dataReady: boolean;
  hasDataError: boolean;
  /** Rendered at the end of the download row (the calendar subscribe button). */
  extraAction?: ReactNode;
}) {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"month" | "year" | null>(null);
  const unavailable = !dataReady;
  const monthEntries = entries.filter((entry) => yearlyCalendarEntryOverlapsMonth(entry, month.year, month.month));
  const notes = monthEntries.filter((entry) => entry.entryType === "note" && entry.weekNumber === null);

  const download = async (scope: "month" | "year") => {
    if (unavailable || busy) return;
    setBusy(scope);
    try {
      const { downloadYearlyCalendarPdf } = await import("@/lib/yearly-calendar-pdf");
      await downloadYearlyCalendarPdf({
        entries,
        events,
        schoolYear,
        lang: language,
        ...(scope === "month" ? month : {}),
      });
    } catch {
      toast({ title: t.yearlyCalendar.pdfErrorTitle, description: t.yearlyCalendar.pdfErrorDescription, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={unavailable || busy !== null} onClick={() => download("month")}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            {busy === "month" ? t.yearlyCalendar.pdfGenerating : t.yearlyCalendar.downloadMonthPdf}
          </Button>
          <Button variant="outline" disabled={unavailable || busy !== null} onClick={() => download("year")}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            {busy === "year" ? t.yearlyCalendar.pdfGenerating : `${t.yearlyCalendar.downloadAllPdf} ${schoolYear}/${schoolYear + 1}`}
          </Button>
          {extraAction}
        </div>
        <p className="text-small text-subtle">{t.calendarWorkspace.downloadHint}</p>
        {hasDataError && <p role="alert" className="text-small text-destructive">{t.calendar.loadFailed}</p>}
      </div>

      {showNotes && notes.length > 0 && (
        <section className="space-y-3 border-l-2 border-hairline pl-4" aria-label={t.calendarWorkspace.wholeMonth}>
          <h2 className="text-h4 font-semibold text-ink">{t.calendarWorkspace.wholeMonth}</h2>
          {notes.map((entry) => (
            <div key={entry.id}>
              <h3 className="text-body font-semibold text-ink">{entry.title}</h3>
              {entry.description && <p className="whitespace-pre-line text-small text-copy">{entry.description}</p>}
            </div>
          ))}
        </section>
      )}

      {editor.isEditor && (
        <EditorSurface collapsible label={t.calendarWorkspace.allEntries} hint={t.calendarWorkspace.allEntriesHint}>
          <Button size="sm" variant="outline" onClick={() => editor.createYearly({ ...month, entryType: "note", weekNumber: null })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />{t.calendarWorkspace.addNote}
          </Button>
          <ul className="w-full divide-y divide-hairline">
            {monthEntries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-body font-semibold text-ink">{entry.title}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-small text-subtle">
                    <CalendarCategory kind={calendarDisplayKindForEntry(entry)} />
                    <span className="tabular-nums">{entry.date ?? (entry.weekNumber === null ? t.calendarWorkspace.wholeMonth : `${t.calendar.week} ${entry.weekNumber}${entry.weekNumberEnd ? `–${entry.weekNumberEnd}` : ""}`)}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => editor.editYearly(entry)} aria-label={`${t.events.edit}: ${entry.title}`}>{t.events.edit}</Button>
              </li>
            ))}
          </ul>
        </EditorSurface>
      )}
    </div>
  );
}
