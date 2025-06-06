import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Påmeldinger - {event.title}</DialogTitle>
          <DialogDescription>
            Oversikt over alle påmeldte deltakere til arrangementet.
          </DialogDescription>
        </DialogHeader>
        <EventRegistrationsView event={event} />
      </DialogContent>
    </Dialog>
  );
}