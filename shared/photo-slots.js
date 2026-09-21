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
 *
 * Plain JS so it can be imported by both Vercel serverless functions
 * (api/*.js) and the Vite-bundled client. Types live in photo-slots.d.ts.
 */

export const PHOTO_SLOT_MINUTES = 5;
const LEGACY_SLOT_MINUTES = 10;
const MINUTES_PER_DAY = 24 * 60;

function parseTime(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return { hours, minutes };
}

// Returns null rather than wrapping. The old implementation formatted through
// a Date, so an offset that ran past midnight rolled into the next day and came
// back as an early-morning time: a 23:00 photo event handed out "00:30", which
// sorts before every other slot and reads as half past midnight that morning.
// There is no valid slot outside the event's own day, so callers drop nulls.
function formatMinutesOffset(startHours, startMinutes, offset) {
  const total = startHours * 60 + startMinutes + offset;
  if (!Number.isFinite(total) || total < 0 || total >= MINUTES_PER_DAY) return null;
  const hh = Math.floor(total / 60).toString().padStart(2, "0");
  const mm = (total % 60).toString().padStart(2, "0");
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
        if (!Number.isFinite(offset)) continue;
        // Round onto the grid instead of discarding. A stored slot that does
        // not land on a 5-minute boundary — because the event's start time was
        // edited after the booking, or the row predates the current grid — was
        // dropped from the occupancy set entirely, so the allocator handed the
        // same minutes to somebody else. A misaligned slot overlaps two cells,
        // and both are taken.
        const cell = Math.floor(offset / PHOTO_SLOT_MINUTES);
        occupied.add(cell);
        if (offset % PHOTO_SLOT_MINUTES !== 0) {
          occupied.add(cell + 1);
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

/**
 * Find the earliest run of `numChildren` consecutive free 5-minute grid
 * cells and return the assigned "HH:MM" slot strings.
 */
export function assignPhotoSlots(event, existingRegistrations, numChildren) {
  if (numChildren <= 0) return [];

  const { hours: startHours, minutes: startMinutes } = parseTime(event.time);
  const occupied = buildOccupiedGridCells(event, existingRegistrations);

  let cell = 0;
  // Cells remaining in the event's own day, not a flat 288: starting from the
  // event time, anything past midnight is not a slot this event can offer.
  const startTotal = startHours * 60 + startMinutes;
  const maxCell = Math.floor((MINUTES_PER_DAY - startTotal) / PHOTO_SLOT_MINUTES);
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
        const time = formatMinutesOffset(startHours, startMinutes, offset);
        if (time !== null) slots.push(time);
      }
      return slots;
    }
  }

  // Fallback: append after the last occupied cell.
  const maxOccupied = occupied.size === 0 ? -1 : Math.max(...Array.from(occupied));
  const slots = [];
  for (let i = 0; i < numChildren; i++) {
    const offset = (maxOccupied + 1 + i) * PHOTO_SLOT_MINUTES;
    const time = formatMinutesOffset(startHours, startMinutes, offset);
    if (time !== null) slots.push(time);
  }
  return slots;
}

/**
 * Resolve the slot list for a single registration, for display purposes.
 * Prefers stored `photoSlots`. Falls back to replaying the legacy 10-min
 * sequential algorithm among other legacy rows in the same event.
 */
export function resolvePhotoSlotsForRegistration(event, registration, allRegistrations) {
  const stored = parseStoredSlots(registration.photoSlots);
  if (stored) return stored;

  const { hours: startHours, minutes: startMinutes } = parseTime(event.time);

  const legacyRegs = allRegistrations
    .filter((reg) => parseStoredSlots(reg.photoSlots) === null && reg.childrenNames !== null && reg.childrenNames !== undefined)
    .sort((a, b) => a.id - b.id);

  let legacyChildrenBefore = 0;
  for (const reg of legacyRegs) {
    if (reg.id === registration.id) {
      const count = reg.attendeeCount || 1;
      const slots = [];
      for (let i = 0; i < count; i++) {
        const offset = (legacyChildrenBefore + i) * LEGACY_SLOT_MINUTES;
        const time = formatMinutesOffset(startHours, startMinutes, offset);
        if (time !== null) slots.push(time);
      }
      return slots;
    }
    legacyChildrenBefore += reg.attendeeCount || 1;
  }

  return [];
}
