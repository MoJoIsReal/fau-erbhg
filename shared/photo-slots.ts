/**
 * Photo-slot scheduling for "foto" events.
 *
 * New bookings receive 5-minute slots. When a booking contains multiple
 * children, they must be placed in consecutive slots. Bookings are packed
 * from the event start time, gap-filling freed slots left by deletions.
 *
 * Legacy registrations (created before the 5-min switch) carry no stored
 * slots and are assumed to occupy 10 minutes per child in registration
 * order from the event start.
 */

export const PHOTO_SLOT_MINUTES = 5;
const LEGACY_SLOT_MINUTES = 10;

export interface PhotoSlotRegistration {
  id: number;
  attendeeCount: number | null;
  childrenNames: string | null;
  photoSlots: string | null;
}

export interface PhotoSlotEvent {
  time: string;
}

function parseTime(hhmm: string): { hours: number; minutes: number } {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return { hours, minutes };
}

function formatMinutesOffset(startHours: number, startMinutes: number, offset: number): string {
  const d = new Date(2000, 0, 1, startHours, startMinutes + offset);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function slotTimeToOffset(
  slot: string,
  startHours: number,
  startMinutes: number,
): number {
  const { hours, minutes } = parseTime(slot);
  const startTotal = startHours * 60 + startMinutes;
  const slotTotal = hours * 60 + minutes;
  return slotTotal - startTotal;
}

function parseStoredSlots(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Build a set of occupied 5-minute grid indices from the existing registrations.
 * Grid index `i` corresponds to minute offset `i * PHOTO_SLOT_MINUTES` from event start.
 *
 * Rows with stored photoSlots block exactly the grid cells listed.
 * Rows without stored photoSlots (legacy) are replayed in id order using the
 * old 10-minute-per-child sequential assignment, and each legacy child blocks
 * two consecutive grid cells (to match its physical 10-minute duration).
 */
function buildOccupiedGridCells(
  event: PhotoSlotEvent,
  existing: PhotoSlotRegistration[],
): Set<number> {
  const occupied = new Set<number>();
  const { hours: startHours, minutes: startMinutes } = parseTime(event.time);

  // Rows with stored slots: mark each slot's cell.
  for (const reg of existing) {
    const stored = parseStoredSlots(reg.photoSlots);
    if (stored) {
      for (const slot of stored) {
        const offset = slotTimeToOffset(slot, startHours, startMinutes);
        if (offset >= 0 && offset % PHOTO_SLOT_MINUTES === 0) {
          occupied.add(offset / PHOTO_SLOT_MINUTES);
        }
      }
    }
  }

  // Legacy rows: replay in id order, 10 min per child, block two grid cells each.
  const legacyRegs = existing
    .filter((reg) => parseStoredSlots(reg.photoSlots) === null && reg.childrenNames !== null)
    .sort((a, b) => a.id - b.id);

  let legacyChildrenBefore = 0;
  for (const reg of legacyRegs) {
    const count = reg.attendeeCount || 1;
    for (let i = 0; i < count; i++) {
      const childIndex = legacyChildrenBefore + i;
      const offset = childIndex * LEGACY_SLOT_MINUTES;
      const baseCell = offset / PHOTO_SLOT_MINUTES; // 10 / 5 = 2 cells per legacy child
      occupied.add(baseCell);
      occupied.add(baseCell + 1);
    }
    legacyChildrenBefore += count;
  }

  return occupied;
}

/**
 * Find the earliest run of `numChildren` consecutive free 5-minute grid cells
 * and return the assigned "HH:MM" slot strings.
 */
export function assignPhotoSlots(
  event: PhotoSlotEvent,
  existingRegistrations: PhotoSlotRegistration[],
  numChildren: number,
): string[] {
  if (numChildren <= 0) return [];

  const { hours: startHours, minutes: startMinutes } = parseTime(event.time);
  const occupied = buildOccupiedGridCells(event, existingRegistrations);

  let cell = 0;
  // Upper bound to keep the search deterministic; 24 h worth of 5-min cells.
  const maxCell = (24 * 60) / PHOTO_SLOT_MINUTES;
  while (cell + numChildren <= maxCell) {
    let fits = true;
    for (let i = 0; i < numChildren; i++) {
      if (occupied.has(cell + i)) {
        fits = false;
        cell = cell + i + 1;
        break;
      }
    }
    if (fits) {
      const slots: string[] = [];
      for (let i = 0; i < numChildren; i++) {
        const offset = (cell + i) * PHOTO_SLOT_MINUTES;
        slots.push(formatMinutesOffset(startHours, startMinutes, offset));
      }
      return slots;
    }
  }

  // Fallback: append after the last occupied cell (should not be reachable in practice).
  const maxOccupied = occupied.size === 0 ? -1 : Math.max(...Array.from(occupied));
  const slots: string[] = [];
  for (let i = 0; i < numChildren; i++) {
    const offset = (maxOccupied + 1 + i) * PHOTO_SLOT_MINUTES;
    slots.push(formatMinutesOffset(startHours, startMinutes, offset));
  }
  return slots;
}

/**
 * Resolve the slot list for a single registration, for display purposes.
 *
 * Prefers stored `photoSlots`. Falls back to replaying the legacy 10-min
 * sequential algorithm among other legacy rows in the same event.
 */
export function resolvePhotoSlotsForRegistration(
  event: PhotoSlotEvent,
  registration: PhotoSlotRegistration,
  allRegistrations: PhotoSlotRegistration[],
): string[] {
  const stored = parseStoredSlots(registration.photoSlots);
  if (stored) return stored;

  const { hours: startHours, minutes: startMinutes } = parseTime(event.time);

  // Replay legacy assignment in id order.
  const legacyRegs = allRegistrations
    .filter((reg) => parseStoredSlots(reg.photoSlots) === null && reg.childrenNames !== null)
    .sort((a, b) => a.id - b.id);

  let legacyChildrenBefore = 0;
  for (const reg of legacyRegs) {
    if (reg.id === registration.id) {
      const count = reg.attendeeCount || 1;
      const slots: string[] = [];
      for (let i = 0; i < count; i++) {
        const offset = (legacyChildrenBefore + i) * LEGACY_SLOT_MINUTES;
        slots.push(formatMinutesOffset(startHours, startMinutes, offset));
      }
      return slots;
    }
    legacyChildrenBefore += reg.attendeeCount || 1;
  }

  return [];
}
