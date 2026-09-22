import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Plus, Upload, Users } from "lucide-react";
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
import { EditorSurface } from "@/components/site/cards";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, getApiErrorBody, getApiErrorMessage } from "@/lib/queryClient";
import type { Event, YearlyCalendarEntry } from "@shared/schema";
import type { YearlyCalendarEntryType } from "@shared/yearly-calendar-utils";
import type { CalendarEntry, YearlyCalendarKind } from "@shared/calendar-entries";
import EventCreationModal from "@/components/event-creation-modal";
import EventRegistrationsModal from "@/components/event-registrations-modal";
import YearlyCalendarEntryModal, { type EntryDraft } from "@/components/yearly-calendar-entry-modal";
import YearlyCalendarImportModal from "@/components/yearly-calendar-import-modal";
import AttendeeTooltip from "@/components/attendee-tooltip";

type CreationTarget =
  | { kind: "event"; event: Event | null }
  | {
      kind: "yearly";
      entryType: YearlyCalendarEntryType;
      category: YearlyCalendarKind | null;
      existing: YearlyCalendarEntry | null;
      initial?: Partial<EntryDraft>;
    };

export type CalendarEditor = {
  isEditor: boolean;
  toolbar: ReactNode;
  createYearly: (initial: Partial<EntryDraft>) => void;
  editYearly: (entry: YearlyCalendarEntry) => void;
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
export function useCalendarEditor({ schoolYear, month }: { schoolYear: number; month: { year: number; month: number } }): CalendarEditor {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canEditEvents = user?.role === "admin" || user?.role === "member";
  const canEditYearly = canEditEvents || user?.role === "staff";

  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState<CreationTarget | null>(null);
  const [registrationsFor, setRegistrationsFor] = useState<Event | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirming, setConfirming] = useState<{ event: Event; action: "cancel" | "delete" } | null>(null);
  const [busy, setBusy] = useState<"template" | null>(null);

  // Excel uses raw rows for the school year containing the displayed month.
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

  const createYearly = (initial: Partial<EntryDraft>) => {
    if (!canEditYearly) return;
    pick({ kind: "yearly", entryType: initial.entryType ?? "day_event", category: null, existing: null,
      initial: { ...month, ...initial } });
  };
  const editYearly = (entry: YearlyCalendarEntry) => {
    if (canEditYearly) pick({ kind: "yearly", entryType: entry.entryType as YearlyCalendarEntryType, category: null, existing: entry });
  };

  // The editor's own strip of the page, on a sand surface with a dashed edge
  // and a label of its own. The guide is explicit that admin actions must not
  // sit among the public filters (§11), and the dashed border is what tells a
  // logged-in editor at a glance which controls the parents can also see.
  const toolbar = !canEditYearly ? null : (
    <EditorSurface collapsible label={t.calendar.editorLabel} hint={`${t.calendarWorkspace.editHint} ${t.yearlyCalendar.schoolYearLabel}: ${schoolYear}/${schoolYear + 1}. ${t.calendar.excelScopeNote}`}>
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
    </EditorSurface>
  );

  const actionsFor = (entry: CalendarEntry): ReactNode => {
    const mayEdit = entry.source === "event" ? canEditEvents : canEditYearly;
    if (!mayEdit) return null;

    const signup = entry.signup;
    const hasAttendees = signup?.mode === "registration" && signup.currentAttendees > 0;
    const showRegistrations = entry.event && signup?.mode === "registration";

    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-hairline pt-4">
        <span className="basis-full text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
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
                  category: null,
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
            className="border-destructive text-destructive"
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
          <p className="text-small text-subtle">{t.calendar.newPickerHint}</p>

          <div className="space-y-2">
            <h3 className="text-micro uppercase tracking-wide text-subtle">
              {t.entryEditor.signup}
            </h3>
            <p className="text-micro text-subtle">{t.calendar.newEventHint}</p>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={!canEditEvents}
              onClick={() => pick({ kind: "event", event: null })}
            >
              {t.calendar.newEventButton}
            </Button>
            {!canEditEvents && (
              <p className="border-l-2 border-destructive pl-2 text-micro text-subtle">
                {t.calendar.staffCannotCreateEvents}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-micro uppercase tracking-wide text-subtle">
              {t.calendar.newEntry}
            </h3>
            <p className="text-micro text-subtle">{t.calendar.newYearlyHint}</p>
            <Button variant="outline" className="w-full justify-start" onClick={() => createYearly({ entryType: "day_event" })}>
              {t.yearlyCalendar.modal.addTitle}
            </Button>
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
          existing={creating.existing}
          initial={creating.initial}
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

  return { isEditor: canEditYearly, toolbar, modals, actionsFor, attendeeCountFor, createYearly, editYearly };
}
