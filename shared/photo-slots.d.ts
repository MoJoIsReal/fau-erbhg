export const PHOTO_SLOT_MINUTES: 5;

export interface PhotoSlotRegistration {
  id: number;
  attendeeCount: number | null;
  childrenNames: string | null;
  photoSlots: string | null;
}

export interface PhotoSlotEvent {
  time: string;
}

export function assignPhotoSlots(
  event: PhotoSlotEvent,
  existingRegistrations: PhotoSlotRegistration[],
  numChildren: number,
): string[];

export function resolvePhotoSlotsForRegistration(
  event: PhotoSlotEvent,
  registration: PhotoSlotRegistration,
  allRegistrations: PhotoSlotRegistration[],
): string[];
