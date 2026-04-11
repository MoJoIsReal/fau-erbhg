/**
 * Photo-slot scheduling for "foto" events (serverless mirror of shared/photo-slots.ts).
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

function parseTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return { hours, minutes };
}

function formatMinutesOffset(startHours, startMinutes, offset) {
  const d = new Date(2000, 0, 1, startHours, startMinutes + offset);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function slotTimeToOffset(slot, startHours, startMinutes) {
  const { hours, minutes } = parseTime(slot);
  const startTotal = startHours * 60 + startMinutes;
  const slotTotal = hours * 60 + minutes;
  return slotTotal - startTotal;
}

function parseStoredSlots(raw) {
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

function buildOccupiedGridCells(event, existing) {
  const occupied = new Set();
  const { hours: startHours, minutes: startMinutes } = parseTime(event.time);

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

  const legacyRegs = existing
    .filter((reg) => parseStoredSlots(reg.photoSlots) === null && reg.childrenNames !== null && reg.childrenNames !== undefined)
    .sort((a, b) => a.id - b.id);

  let legacyChildrenBefore = 0;
  for (const reg of legacyRegs) {
    const count = reg.attendeeCount || 1;
    for (let i = 0; i < count; i++) {
      const childIndex = legacyChildrenBefore + i;
      const offset = childIndex * LEGACY_SLOT_MINUTES;
      const baseCell = offset / PHOTO_SLOT_MINUTES;
      occupied.add(baseCell);
      occupied.add(baseCell + 1);
    }
    legacyChildrenBefore += count;
  }

  return occupied;
}

export function assignPhotoSlots(event, existingRegistrations, numChildren) {
  if (numChildren <= 0) return [];

  const { hours: startHours, minutes: startMinutes } = parseTime(event.time);
  const occupied = buildOccupiedGridCells(event, existingRegistrations);

  let cell = 0;
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
      const slots = [];
      for (let i = 0; i < numChildren; i++) {
        const offset = (cell + i) * PHOTO_SLOT_MINUTES;
        slots.push(formatMinutesOffset(startHours, startMinutes, offset));
      }
      return slots;
    }
  }

  const maxOccupied = occupied.size === 0 ? -1 : Math.max(...Array.from(occupied));
  const slots = [];
  for (let i = 0; i < numChildren; i++) {
    const offset = (maxOccupied + 1 + i) * PHOTO_SLOT_MINUTES;
    slots.push(formatMinutesOffset(startHours, startMinutes, offset));
  }
  return slots;
}
