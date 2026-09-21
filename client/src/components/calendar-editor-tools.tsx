import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Plus, Table, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, getApiErrorBody, getApiErrorMessage } from "@/lib/queryClient";
import { KIND_STYLE } from "@/lib/calendar-kind-style";
import type { Event, YearlyCalendarEntry } from "@shared/schema";
import type { YearlyCalendarEntryType } from "@shared/yearly-calendar-utils";
import type { CalendarEntry, YearlyCalendarKind } from "@shared/calendar-entries";
import { YEARLY_CALENDAR_KINDS } from "@shared/calendar-entries";
import EventCreationModal from "@/components/event-creation-modal";
import EventRegistrationsModal from "@/components/event-registrations-modal";
import YearlyCalendarEntryModal from "@/components/yearly-calendar-entry-modal";
import YearlyCalendarImportModal from "@/components/yearly-calendar-import-modal";
import AttendeeTooltip from "@/components/attendee-tooltip";

// The five yearly kinds map straight onto entry_type, so the picker can
// prefill the form. Events cannot: their type is one field among many in a
// form that also carries signup, so that branch opens the event form as it is.
const KIND_TO_ENTRY_TYPE: Record<YearlyCalendarKind, YearlyCalendarEntryType> = {
  bhgdag: "day_event",
  varmmat: "food",
  temauke: "week_event",
  stengt: "closed",
  beskjed: "note",
};

type CreationTarget =
  | { kind: "event"; event: Event | null }
  | { kind: "yearly"; entryType: YearlyCalendarEntryType; existing: YearlyCalendarEntry | null };

export type CalendarEditor = {
  isEditor: boolean;
  toolbar: ReactNode;
  modals: ReactNode;
  actionsFor: (entry: CalendarEntry) => ReactNode;
  /** The attendee count as a tooltip naming who is coming, for editors. */
  attendeeCountFor: (entry: CalendarEntry) => ReactNode;
};

/**
 * Everything only a logged-in council member or staff sees: the toolbar above
 * the calendar, the "new entry" type picker, and the edit controls inside the
 * detail panel.
 *
 * Creating is two steps rather than one form. The two halves of the calendar
 * are two tables with two different permissions — arrangementer live in
 * `events` and only COUNCIL_ROLES may touch them, everything under
 * "Barnehagen" lives in `yearly_calendar_entries`, which staff may edit too —
 * so the picker is where that split belongs. Both branches then open the
 * existing modal unchanged.
 */
export function useCalendarEditor({ schoolYear }: { schoolYear: number }): CalendarEditor {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canEditEvents = user?.role === "admin" || user?.role === "member";
  const canEditYearly = canEditEvents || user?.role === "staff";

  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState<CreationTarget | null>(null);
  const [registrationsFor, setRegistrationsFor] = useState<Event | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirming, setConfirming] = useState<{ event: Event; action: "cancel" | "delete" } | null>(null);
  const [busy, setBusy] = useState<"pdf" | "template" | null>(null);

  // PDF and Excel both work on the raw rows for one school year, not on the
  // merged shape. Same query keys as everywhere else, so this is the cache.
  const { data: events = [] } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: yearlyEntries = [] } = useQuery<YearlyCalendarEntry[]>({
    queryKey: [`/api/yearly-calendar?schoolYear=${schoolYear}`],
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/events?id=${id}&action=cancel`),
    onSuccess: () => {
      toast({ title: t.events.eventCancelled, description: t.events.eventHasBeenCancelled });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: () => toast({ title: t.events.cancellationError, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/events?id=${id}`),
    onSuccess: () => {
      toast({ title: t.events.eventDeleted, description: t.events.eventHasBeenDeleted });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    // The handler refuses to delete an event that has registrations, and says
    // so in the body. Without reading it the user gets "something went wrong"
    // for a rule they could have acted on.
    onError: (error: unknown) => {
      const errorData = getApiErrorBody(error);
      if (errorData?.hasRegistrations) {
        toast({
          title: t.events.cannotDelete,
          description: t.events.eventHasRegistrationsCannot,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t.events.couldNotDelete,
        description: getApiErrorMessage(error, t.events.errorOccurredWhileDeleting),
        variant: "destructive",
      });
    },
  });

  const downloadPdf = async () => {
    setBusy("pdf");
    try {
      const { downloadYearlyCalendarPdf } = await import("@/lib/yearly-calendar-pdf");
      await downloadYearlyCalendarPdf({ entries: yearlyEntries, events, schoolYear, lang: language });
    } catch (err) {
      toast({
        title: t.yearlyCalendar.pdfErrorTitle,
        description: t.yearlyCalendar.pdfErrorDescription,
        variant: "destructive",
      });
      console.error("Yearly calendar PDF download failed", err);
    } finally {
      setBusy(null);
    }
  };

  const downloadTemplate = async () => {
    setBusy("template");
    try {
      const { downloadYearlyCalendarTemplate } = await import("@/lib/yearly-calendar-excel");
      await downloadYearlyCalendarTemplate({ schoolYear, entries: yearlyEntries });
    } catch (err) {
      toast({
        title: t.yearlyCalendar.excelTemplateErrorTitle,
        description: t.yearlyCalendar.excelTemplateErrorDescription,
        variant: "destructive",
      });
      console.error("Yearly calendar Excel template download failed", err);
    } finally {
      setBusy(null);
    }
  };

  const pick = (target: CreationTarget) => {
    setPickerOpen(false);
    setCreating(target);
  };

  const toolbar = !canEditYearly ? null : (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
      <span className="mr-1 text-[11px] uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
        {t.calendar.editorLabel}
      </span>
      <Button size="sm" onClick={() => setPickerOpen(true)}>
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        {t.calendar.newEntry}
      </Button>
      <Button size="sm" variant="outline" onClick={downloadTemplate} disabled={busy !== null}>
        <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" />
        {t.yearlyCalendar.downloadTemplate}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
        <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
        {t.yearlyCalendar.importExcel}
      </Button>
      <Button size="sm" variant="outline" onClick={downloadPdf} disabled={busy !== null}>
        <Download className="mr-1 h-4 w-4" aria-hidden="true" />
        {busy === "pdf" ? t.yearlyCalendar.pdfGenerating : t.yearlyCalendar.downloadAllPdf}
      </Button>
      {/* The printable årskalender keeps its own editing surface: a
          month-by-month layout with drag-and-drop, which a week list and a
          month grid cannot replace. It is no longer a public tab. */}
      <Button size="sm" variant="outline" asChild>
        <Link href="/kalender/arskalender">
          <Table className="mr-1 h-4 w-4" aria-hidden="true" />
          {t.calendar.openYearlyEditor}
        </Link>
      </Button>
      <p className="basis-full text-xs text-neutral-500 dark:text-neutral-400">{t.calendar.excelScopeNote}</p>
    </div>
  );

  const actionsFor = (entry: CalendarEntry): ReactNode => {
    const mayEdit = entry.source === "event" ? canEditEvents : canEditYearly;
    if (!mayEdit) return null;

    const signup = entry.signup;
    const hasAttendees = signup?.mode === "registration" && signup.currentAttendees > 0;
    const showRegistrations = entry.event && signup?.mode === "registration";

    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-dashed pt-3 dark:border-neutral-800">
        <span className="basis-full text-[11px] uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
          {t.calendar.editorLabel}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            entry.event
              ? setCreating({ kind: "event", event: entry.event })
              : entry.entry &&
                setCreating({
                  kind: "yearly",
                  entryType: entry.entry.entryType as YearlyCalendarEntryType,
                  existing: entry.entry,
                })
          }
        >
          {t.events.edit}
        </Button>

        {showRegistrations && (
          <Button size="sm" variant="outline" onClick={() => setRegistrationsFor(entry.event)}>
            <Users className="mr-1 h-4 w-4" aria-hidden="true" />
            {t.events.viewRegistrations}
          </Button>
        )}

        {/* An event with people signed up is cancelled, never deleted — the
            registrations are the record that they were coming. A yearly entry
            is deleted from inside its own edit form. */}
        {entry.event && !entry.cancelled && (
          <Button
            size="sm"
            variant="outline"
            className="border-red-500 text-red-600 dark:text-red-300"
            onClick={() =>
              setConfirming({ event: entry.event as Event, action: hasAttendees ? "cancel" : "delete" })
            }
          >
            {hasAttendees ? t.events.cancel : t.yearlyCalendar.modal.delete}
          </Button>
        )}
      </div>
    );
  };

  const modals = (
    <>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.calendar.newEntry}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t.calendar.newPickerHint}</p>

          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t.calendar.filterSignup}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.calendar.newEventHint}</p>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={!canEditEvents}
              onClick={() => pick({ kind: "event", event: null })}
            >
              {t.calendar.newEventButton}
            </Button>
            {!canEditEvents && (
              <p className="border-l-2 border-red-500 pl-2 text-xs text-neutral-500 dark:text-neutral-400">
                {t.calendar.staffCannotCreateEvents}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t.calendar.filterKindergarten}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.calendar.newYearlyHint}</p>
            <div className="grid grid-cols-2 gap-2">
              {YEARLY_CALENDAR_KINDS.map((kind) => (
                <Button
                  key={kind}
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() =>
                    pick({ kind: "yearly", entryType: KIND_TO_ENTRY_TYPE[kind], existing: null })
                  }
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${KIND_STYLE[kind].dot}`}
                    aria-hidden="true"
                  />
                  {t.calendar.kinds[kind]}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EventCreationModal
        isOpen={creating?.kind === "event"}
        onClose={() => setCreating(null)}
        event={creating?.kind === "event" ? creating.event : null}
      />

      {creating?.kind === "yearly" && (
        <YearlyCalendarEntryModal
          isOpen
          onClose={() => setCreating(null)}
          schoolYear={schoolYear}
          existing={creating.existing}
          initial={creating.existing ? undefined : { entryType: creating.entryType }}
        />
      )}

      <EventRegistrationsModal
        event={registrationsFor}
        isOpen={registrationsFor !== null}
        onClose={() => setRegistrationsFor(null)}
      />

      <YearlyCalendarImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        schoolYear={schoolYear}
      />

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.action === "cancel" ? t.calendar.confirmCancelTitle : t.events.deleteEvent}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.action === "cancel" ? t.calendar.confirmCancelBody : t.calendar.confirmDeleteBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirming) return;
                if (confirming.action === "cancel") cancelMutation.mutate(confirming.event.id);
                else deleteMutation.mutate(confirming.event.id);
                setConfirming(null);
              }}
            >
              {confirming?.action === "cancel" ? t.events.cancel : t.yearlyCalendar.modal.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  const attendeeCountFor = (entry: CalendarEntry): ReactNode => {
    if (!canEditEvents || !entry.event || entry.signup?.mode !== "registration") return null;
    return (
      <AttendeeTooltip
        eventId={entry.event.id}
        attendeeCount={entry.signup.currentAttendees}
        maxAttendees={entry.signup.maxAttendees}
      />
    );
  };

  return { isEditor: canEditYearly, toolbar, modals, actionsFor, attendeeCountFor };
}
