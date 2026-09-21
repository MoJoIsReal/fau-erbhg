import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PHOTO_SLOT_MINUTES,
  assignPhotoSlots,
  resolvePhotoSlotsForRegistration,
} from '../shared/photo-slots.js';

function registration(id, { slots = null, children = 'Ada', attendeeCount = 1 } = {}) {
  return {
    id,
    attendeeCount,
    childrenNames: children,
    photoSlots: slots === null ? null : JSON.stringify(slots),
  };
}

test('bookings pack forward from the event start in five-minute slots', () => {
  const event = { time: '17:00' };
  assert.deepEqual(assignPhotoSlots(event, [], 1), ['17:00']);
  assert.deepEqual(
    assignPhotoSlots(event, [registration(1, { slots: ['17:00'] })], 2),
    ['17:05', '17:10'],
  );
  assert.equal(PHOTO_SLOT_MINUTES, 5);
});

test('a freed gap is filled before the end of the queue', () => {
  const event = { time: '17:00' };
  const existing = [
    registration(1, { slots: ['17:00'] }),
    registration(3, { slots: ['17:10'] }),
  ];
  assert.deepEqual(assignPhotoSlots(event, existing, 1), ['17:05']);
});

// MAINT-007, first half. A stored slot that does not sit on the 5-minute grid
// — because the event's start time was edited after the booking, or the row
// predates the current grid — was dropped from the occupancy set entirely, and
// the allocator then handed the same minutes to the next parent.
test('a slot off the five-minute grid still occupies the time it covers', () => {
  const event = { time: '17:00' };
  const existing = [registration(1, { slots: ['17:07'] })];

  const assigned = assignPhotoSlots(event, existing, 1);

  assert.notDeepEqual(assigned, ['17:05'], '17:05–17:10 overlaps the stored 17:07 booking');
  assert.deepEqual(assigned, ['17:00']);
  assert.deepEqual(
    assignPhotoSlots(event, [...existing, registration(2, { slots: ['17:00'] })], 1),
    ['17:15'],
    'both cells the misaligned booking touches are taken',
  );
});

test('a stored slot before the event start still blocks the opening cell', () => {
  const event = { time: '17:00' };
  // The event was moved later; this booking now sits 3 minutes before it.
  const existing = [registration(1, { slots: ['16:57'] })];

  assert.deepEqual(assignPhotoSlots(event, existing, 1), ['17:05']);
});

test('an unparseable stored slot is ignored rather than throwing', () => {
  const event = { time: '17:00' };
  const existing = [registration(1, { slots: ['ikke en tid'] })];

  assert.deepEqual(assignPhotoSlots(event, existing, 1), ['17:00']);
});

// MAINT-007, second half. formatMinutesOffset built its result through a Date,
// so an offset that ran past midnight rolled into the next day and came back as
// an early-morning time — "00:30" sorts ahead of every other slot and reads as
// half past midnight that same morning.
test('slots never wrap past midnight', () => {
  const event = { time: '23:40' };

  const assigned = assignPhotoSlots(event, [], 4);

  assert.deepEqual(assigned, ['23:40', '23:45', '23:50', '23:55']);
  for (const slot of assigned) {
    assert.ok(slot >= '23:40', `${slot} must not be earlier than the event start`);
  }
});

test('a late event stops offering slots at the end of its own day', () => {
  const event = { time: '23:50' };

  const assigned = assignPhotoSlots(event, [], 6);

  assert.ok(assigned.length > 0, 'a late booking still gets whatever the day has left');
  for (const slot of assigned) {
    assert.ok(slot >= '23:50', `${slot} must not have wrapped into the next day`);
  }
});

test('legacy registrations without stored slots occupy ten minutes per child', () => {
  const event = { time: '17:00' };
  const legacy = [registration(1, { attendeeCount: 2 })];

  assert.deepEqual(
    resolvePhotoSlotsForRegistration(event, legacy[0], legacy),
    ['17:00', '17:10'],
  );
  assert.deepEqual(assignPhotoSlots(event, legacy, 1), ['17:20']);
});

test('a registration with stored slots resolves to exactly those slots', () => {
  const event = { time: '17:00' };
  const booked = registration(4, { slots: ['17:25', '17:30'] });

  assert.deepEqual(
    resolvePhotoSlotsForRegistration(event, booked, [booked]),
    ['17:25', '17:30'],
  );
});

test('asking for no children returns no slots', () => {
  assert.deepEqual(assignPhotoSlots({ time: '17:00' }, [], 0), []);
});
