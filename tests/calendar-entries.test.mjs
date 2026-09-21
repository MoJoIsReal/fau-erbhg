import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALENDAR_ENTRY_KINDS,
  calendarKindForEntryType,
  calendarKindForEventType,
  calendarKindSource,
  calendarWeekKey,
  describeEventSignup,
  groupCalendarEntriesByWeek,
  isoWeekRange,
  isoWeekYear,
  isoWeekYearForRow,
  mergeCalendarEntries,
  normalizeEvent,
  normalizeYearlyEntry,
  parseCalendarDate,
} from '../shared/calendar-entries.js';

function event(overrides = {}) {
  return {
    id: 1,
    title: 'Høstdugnad',
    description: 'Vi barker trærne.',
    date: '2026-09-25',
    time: '16:00',
    location: 'Barnehagen',
    customLocation: null,
    maxAttendees: 30,
    currentAttendees: 14,
    registrationDeadline: null,
    type: 'dugnad',
    status: 'active',
    vigiloSignup: false,
    noSignup: false,
    ...overrides,
  };
}

function entry(overrides = {}) {
  return {
    id: 1,
    schoolYear: 2026,
    year: 2026,
    month: 9,
    entryType: 'food',
    weekNumber: 39,
    weekNumberEnd: null,
    weekdayStart: null,
    weekdayEnd: null,
    date: null,
    startTime: null,
    endTime: null,
    title: 'Fiskesuppe',
    description: null,
    color: null,
    showOnHomepage: false,
    showForParents: false,
    ...overrides,
  };
}

test('every event type maps to a known kind, unknown types included', () => {
  assert.equal(calendarKindForEventType('meeting'), 'mote');
  assert.equal(calendarKindForEventType('dugnad'), 'dugnad');
  assert.equal(calendarKindForEventType('foto'), 'foto');
  assert.equal(calendarKindForEventType('internal'), 'internt');
  assert.equal(calendarKindForEventType('event'), 'arrangement');
  assert.equal(calendarKindForEventType('annet'), 'arrangement');
  // Type is free text in the DB, so a stray value must still land somewhere.
  assert.equal(calendarKindForEventType('julebord'), 'arrangement');
  assert.equal(calendarKindForEventType(undefined), 'arrangement');
});

test('every yearly entry type maps to a known kind', () => {
  assert.equal(calendarKindForEntryType('day_event'), 'bhgdag');
  assert.equal(calendarKindForEntryType('closed'), 'stengt');
  assert.equal(calendarKindForEntryType('food'), 'varmmat');
  assert.equal(calendarKindForEntryType('week_event'), 'temauke');
  assert.equal(calendarKindForEntryType('note'), 'beskjed');
  assert.equal(calendarKindForEntryType('tull'), 'beskjed');
});

test('kinds split into the two tables that own them', () => {
  const sources = CALENDAR_ENTRY_KINDS.map(calendarKindSource);
  assert.equal(sources.filter((s) => s === 'event').length, 5);
  assert.equal(sources.filter((s) => s === 'yearly').length, 5);
  assert.equal(calendarKindSource('dugnad'), 'event');
  assert.equal(calendarKindSource('varmmat'), 'yearly');
});

test('ISO date strings parse as local midnight, not UTC', () => {
  const date = parseCalendarDate('2026-09-25');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getDate(), 25);
  assert.equal(date.getHours(), 0);
  assert.equal(parseCalendarDate('25.09.2026'), null);
  assert.equal(parseCalendarDate(null), null);
  assert.equal(parseCalendarDate('2026-13-45'), null);
});

test('the week-year follows the week, not the calendar year', () => {
  // 2026-12-31 is a Thursday in ISO week 53 of 2026.
  assert.equal(isoWeekYear(parseCalendarDate('2026-12-31')), 2026);
  // 2027-01-01 is a Friday, still in that same week 53 of 2026.
  assert.equal(isoWeekYear(parseCalendarDate('2027-01-01')), 2026);
  // 2027-01-04 is the Monday of week 1 of 2027.
  assert.equal(isoWeekYear(parseCalendarDate('2027-01-04')), 2027);
});

test('week-only rows resolve the year the row and the week disagree about', () => {
  assert.equal(isoWeekYearForRow(2026, 9, 39), 2026);
  // Week 1 stored on a December row belongs to the next year.
  assert.equal(isoWeekYearForRow(2026, 12, 1), 2027);
  // Week 53 stored on a January row belongs to the previous one.
  assert.equal(isoWeekYearForRow(2027, 1, 53), 2026);
});

test('week keys sort across the new year', () => {
  assert.ok(calendarWeekKey(2026, 53) < calendarWeekKey(2027, 1));
  assert.ok(calendarWeekKey(2026, 39) < calendarWeekKey(2026, 40));
});

test('a week range runs Monday to Sunday', () => {
  const { start, end } = isoWeekRange(2026, 39);
  assert.equal(start.getDay(), 1);
  assert.equal(end.getDay(), 0);
  assert.equal(start.getDate(), 21);
  assert.equal(start.getMonth(), 8);
  assert.equal(Math.round((end - start) / 86400000), 6);
});

test('signup state distinguishes the four ways an event takes påmelding', () => {
  const now = new Date('2026-09-20T12:00:00Z');
  assert.equal(describeEventSignup(event(), now).mode, 'registration');
  assert.equal(describeEventSignup(event({ vigiloSignup: true }), now).mode, 'vigilo');
  assert.equal(describeEventSignup(event({ noSignup: true }), now).mode, 'none');
  assert.equal(describeEventSignup(event({ type: 'internal' }), now).mode, 'internal');
  // An internal event takes no signups even if the flags say otherwise.
  assert.equal(describeEventSignup(event({ type: 'internal', vigiloSignup: true }), now).mode, 'internal');
});

test('signup state reports full, closed and remaining spots', () => {
  const now = new Date('2026-09-20T12:00:00Z');

  const open = describeEventSignup(event(), now);
  assert.equal(open.spotsLeft, 16);
  assert.equal(open.isFull, false);
  assert.equal(open.isOpen, true);

  const full = describeEventSignup(event({ currentAttendees: 30 }), now);
  assert.equal(full.isFull, true);
  assert.equal(full.spotsLeft, 0);
  assert.equal(full.isOpen, false);

  const closed = describeEventSignup(event({ registrationDeadline: '2026-09-18T23:59:00Z' }), now);
  assert.equal(closed.deadlinePassed, true);
  assert.equal(closed.isOpen, false);

  const stillOpen = describeEventSignup(event({ registrationDeadline: '2026-09-24T12:00:00Z' }), now);
  assert.equal(stillOpen.deadlinePassed, false);
  assert.equal(stillOpen.isOpen, true);

  // No cap means unlimited, not zero spots left.
  const uncapped = describeEventSignup(event({ maxAttendees: null }), now);
  assert.equal(uncapped.spotsLeft, null);
  assert.equal(uncapped.isFull, false);
});

test('an event normalizes onto its ISO week with the custom location preferred', () => {
  const normalized = normalizeEvent(event({ customLocation: 'Samfunnshuset', location: 'Annet' }));
  assert.equal(normalized.id, 'event-1');
  assert.equal(normalized.source, 'event');
  assert.equal(normalized.kind, 'dugnad');
  assert.equal(normalized.week, 39);
  assert.equal(normalized.weekEnd, 39);
  assert.equal(normalized.weekYear, 2026);
  assert.equal(normalized.location, 'Samfunnshuset');
  assert.equal(normalized.cancelled, false);
  assert.equal(normalized.entry, null);
});

test('a cancelled event is kept, flagged rather than dropped', () => {
  const normalized = normalizeEvent(event({ status: 'cancelled' }));
  assert.equal(normalized.cancelled, true);
});

test('an event with an unusable date is dropped instead of floating to the top', () => {
  assert.equal(normalizeEvent(event({ date: '' })), null);
  assert.equal(normalizeEvent(event({ date: 'snart' })), null);
});

test('a dated yearly entry normalizes like an event does', () => {
  const normalized = normalizeYearlyEntry(entry({
    entryType: 'closed',
    date: '2026-10-02',
    weekNumber: null,
    month: 10,
    title: 'Planleggingsdag',
  }));
  assert.equal(normalized.kind, 'stengt');
  assert.equal(normalized.date, '2026-10-02');
  assert.equal(normalized.week, 40);
  assert.equal(normalized.weekYear, 2026);
  assert.equal(normalized.signup, null);
});

test('a week-spanning entry keeps its start and end week', () => {
  const normalized = normalizeYearlyEntry(entry({
    entryType: 'week_event',
    weekNumber: 39,
    weekNumberEnd: 41,
    title: 'Brannvernuke',
  }));
  assert.equal(normalized.kind, 'temauke');
  assert.equal(normalized.date, null);
  assert.equal(normalized.week, 39);
  assert.equal(normalized.weekEnd, 41);
});

test('a bad end week falls back to a single week rather than an inverted span', () => {
  assert.equal(normalizeYearlyEntry(entry({ weekNumber: 39, weekNumberEnd: 35 })).weekEnd, 39);
  assert.equal(normalizeYearlyEntry(entry({ weekNumber: 39, weekNumberEnd: 99 })).weekEnd, 39);
  assert.equal(normalizeYearlyEntry(entry({ weekNumber: 39, weekNumberEnd: null })).weekEnd, 39);
});

test('a dateless entry with no usable week is dropped', () => {
  assert.equal(normalizeYearlyEntry(entry({ weekNumber: null })), null);
  assert.equal(normalizeYearlyEntry(entry({ weekNumber: 0 })), null);
  assert.equal(normalizeYearlyEntry(entry({ weekNumber: 60 })), null);
});

test('merging sorts by week then weekday, week-wide entries first', () => {
  const merged = mergeCalendarEntries({
    events: [
      event({ id: 1, date: '2026-09-25', title: 'Høstdugnad' }),
      event({ id: 2, date: '2026-09-23', title: 'Foreldremøte', type: 'meeting' }),
      event({ id: 3, date: '2026-10-08', title: 'FAU-møte', type: 'meeting' }),
    ],
    entries: [entry({ id: 1, weekNumber: 39, title: 'Fiskesuppe' })],
  });

  assert.deepEqual(merged.map((item) => item.title), [
    'Fiskesuppe',      // week 39, spans the week
    'Foreldremøte',    // week 39, Wednesday
    'Høstdugnad',      // week 39, Friday
    'FAU-møte',        // week 41
  ]);
});

test('merging drops duplicates so overlapping school-year fetches are safe', () => {
  const shared = entry({ id: 7, weekNumber: 39 });
  const merged = mergeCalendarEntries({ entries: [shared, { ...shared }] });
  assert.equal(merged.length, 1);
});

test('grouping separates what spans a week from what happens on a day', () => {
  const merged = mergeCalendarEntries({
    events: [event({ id: 1, date: '2026-09-25' })],
    entries: [
      entry({ id: 1, weekNumber: 39, title: 'Fiskesuppe' }),
      entry({ id: 2, entryType: 'week_event', weekNumber: 39, weekNumberEnd: 40, title: 'Brannvernuke' }),
    ],
  });
  const groups = groupCalendarEntriesByWeek(merged);

  assert.deepEqual(groups.map((g) => g.week), [39, 40]);
  assert.deepEqual(groups[0].spanning.map((e) => e.title), ['Fiskesuppe', 'Brannvernuke']);
  assert.deepEqual(groups[0].dated.map((e) => e.title), ['Høstdugnad']);
  // Week 40 exists only because the temauke reaches into it.
  assert.deepEqual(groups[1].spanning.map((e) => e.title), ['Brannvernuke']);
  assert.equal(groups[1].dated.length, 0);
});

test('a span that started before the cutoff still shows in the weeks after it', () => {
  const merged = mergeCalendarEntries({
    entries: [entry({ id: 1, entryType: 'week_event', weekNumber: 38, weekNumberEnd: 41, title: 'Brannvernuke' })],
  });
  const groups = groupCalendarEntriesByWeek(merged, { fromWeekKey: calendarWeekKey(2026, 40) });

  assert.deepEqual(groups.map((g) => g.week), [40, 41]);
  assert.deepEqual(groups[0].spanning.map((e) => e.title), ['Brannvernuke']);
});

test('the cutoff hides past weeks entirely', () => {
  const merged = mergeCalendarEntries({
    events: [
      event({ id: 1, date: '2026-09-04', title: 'Gammel dugnad' }),
      event({ id: 2, date: '2026-10-08', title: 'FAU-møte', type: 'meeting' }),
    ],
  });
  const groups = groupCalendarEntriesByWeek(merged, { fromWeekKey: calendarWeekKey(2026, 39) });

  assert.deepEqual(groups.map((g) => g.week), [41]);
});

test('weeks group correctly across the turn of the year', () => {
  const merged = mergeCalendarEntries({
    events: [
      event({ id: 1, date: '2026-12-30', title: 'Romjulslek', type: 'event' }),
      event({ id: 2, date: '2027-01-05', title: 'Nyttårsmøte', type: 'meeting' }),
    ],
    entries: [entry({ id: 1, year: 2026, month: 12, weekNumber: 53, title: 'Ukens varmmat' })],
  });
  const groups = groupCalendarEntriesByWeek(merged);

  assert.deepEqual(groups.map((g) => [g.weekYear, g.week]), [[2026, 53], [2027, 1]]);
  assert.deepEqual(groups[0].spanning.map((e) => e.title), ['Ukens varmmat']);
  assert.deepEqual(groups[0].dated.map((e) => e.title), ['Romjulslek']);
});

test('merging an empty calendar yields an empty list, not a throw', () => {
  assert.deepEqual(mergeCalendarEntries(), []);
  assert.deepEqual(mergeCalendarEntries({ events: [], entries: [] }), []);
  assert.deepEqual(groupCalendarEntriesByWeek([]), []);
});

test('a day_event is dropped when an event already covers that day', () => {
  const merged = mergeCalendarEntries({
    events: [event({ id: 1, date: '2026-09-25', title: 'Høstdugnad' })],
    entries: [
      entry({ id: 1, entryType: 'day_event', date: '2026-09-25', weekNumber: null, title: 'Foreldredugnad i regi av FAU' }),
      entry({ id: 2, entryType: 'day_event', date: '2026-09-24', weekNumber: null, title: 'FN-dagen' }),
    ],
  });

  assert.deepEqual(merged.map((item) => item.title), ['FN-dagen', 'Høstdugnad']);
});

test('"stengt" survives a day that also has an event', () => {
  const merged = mergeCalendarEntries({
    events: [event({ id: 1, date: '2026-10-02', title: 'Dugnad' })],
    entries: [entry({ id: 1, entryType: 'closed', date: '2026-10-02', weekNumber: null, title: 'Planleggingsdag' })],
  });

  assert.equal(merged.length, 2);
  assert.ok(merged.some((item) => item.kind === 'stengt'));
});

test('week-spanning entries are never touched by the duplicate rule', () => {
  const merged = mergeCalendarEntries({
    events: [event({ id: 1, date: '2026-09-25' })],
    entries: [entry({ id: 1, weekNumber: 39, title: 'Fiskesuppe' })],
  });
  assert.equal(merged.length, 2);
});
