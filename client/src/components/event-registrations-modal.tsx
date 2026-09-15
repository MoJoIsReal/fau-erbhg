import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import EventRegistrationsView from "./event-registrations-view";
import type { Event } from "@shared/schema";

interface EventRegistrationsModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EventRegistrationsModal({ event, isOpen, onClose }: EventRegistrationsModalProps) {
  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Full-screen on a phone, centred dialog from sm up — same treatment as
          the document and event modals. As a centred box it was wider than the
          screen and clipped the list on the right. */}
      <DialogContent className="flex flex-col gap-0 p-0 top-0 left-0 translate-x-0 translate-y-0 w-full max-w-none h-dvh max-h-dvh rounded-none sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-4xl sm:h-auto sm:max-h-[80vh] sm:rounded-lg">
        <div className="flex-shrink-0 px-4 pt-4 pb-3 pr-12 border-b border-border sm:px-6 sm:pt-6 sm:pb-4">
          <DialogTitle className="text-base font-semibold break-words sm:text-lg">
            Påmeldinger - {event.title}
          </DialogTitle>
          <DialogDescription className="mt-1">
            Oversikt over alle påmeldte deltakere til arrangementet.
          </DialogDescription>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
          <EventRegistrationsView event={event} />
        </div>
      </DialogContent>
    </Dialog>
  );
}