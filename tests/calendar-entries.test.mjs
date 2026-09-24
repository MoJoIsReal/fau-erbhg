import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENT_TYPES } from '../shared/constants.js';
import {
  CALENDAR_ENTRY_KINDS,
  calendarKindForEntry,
  calendarKindForEntryType,
  calendarKindForEventType,
  calendarKindSource,
  calendarDisplayKind,
  calendarDisplayKindForEntry,
  calendarWeekKey,
  compareSpanningEntries,
  describeEventSignup,
  groupCalendarEntriesByWeek,
  isoWeekRange,
  isoWeekYear,
  isoWeekYearForRow,
  mergeCalendarEntries,
  normalizeEvent,
  normalizeYearlyEntry,
  parseCalendarDate,
  schoolYearWeeks,
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

test('a signup event replaces the yearly duplicate while closures and separate internal meetings survive', () => {
  const date = '2026-09-20';
  const signup = event({ date, time: '11:00' });
  const yearly = entry({ entryType: 'day_event', date, category: 'arrangement', title: 'Foreldredugnad i regi av FAU' });
  const merged = mergeCalendarEntries({
    events: [signup, { ...signup }],
    entries: [
      yearly, { ...yearly },
      entry({ id: 2, entryType: 'closed', date, title: 'Stengt' }),
      entry({ id: 3, entryType: 'day_event', date, category: 'internt', title: 'SU-møte' }),
    ],
  });
  assert.deepEqual(merged.map((item) => item.title).sort(), ['Høstdugnad', 'SU-møte', 'Stengt']);
  assert.equal(merged.find((item) => item.source === 'event').startTime, '11:00');
});

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
  assert.equal(sources.filter((s) => s === 'event').length, 6);
  assert.equal(sources.filter((s) => s === 'yearly').length, 6);
  assert.equal(calendarKindSource('dugnad'), 'event');
  assert.equal(calendarKindSource('varmmat'), 'yearly');
  assert.equal(calendarKindSource('info'), 'yearly');
});

test('an entry without a category still follows its type', () => {
  // The column is nullable, and null has to read exactly as the calendar did
  // before it existed — otherwise every row already in the database changes
  // category the day the migration runs.
  assert.equal(calendarKindForEntry({ entryType: 'day_event' }), 'bhgdag');
  assert.equal(calendarKindForEntry({ entryType: 'day_event', category: null }), 'bhgdag');
  assert.equal(calendarKindForEntry({ entryType: 'closed' }), 'stengt');
  assert.equal(calendarKindForEntry(undefined), 'beskjed');
});

test('a category overrides the type it was derived from', () => {
  // The three rows that prompted the column: a registration deadline, an SU
  // meeting and a festival parents are invited to were all day_event, so all
  // three read "I barnehagen".
  assert.equal(calendarKindForEntry({ entryType: 'day_event', category: 'info' }), 'info');
  assert.equal(calendarKindForEntry({ entryType: 'day_event', category: 'internt' }), 'internt');
  assert.equal(
    calendarKindForEntry({ entryType: 'day_event', category: 'arrangement' }),
    'arrangement',
  );
  // A week row may be categorised too.
  assert.equal(calendarKindForEntry({ entryType: 'week_event', category: 'info' }), 'info');
});

test('an unknown category falls back to the type rather than leaking through', () => {
  assert.equal(calendarKindForEntry({ entryType: 'day_event', category: 'tull' }), 'bhgdag');
  assert.equal(calendarKindForEntry({ entryType: 'food', category: '' }), 'varmmat');
  assert.equal(calendarKindForEntry({ entryType: 'note', category: 42 }), 'beskjed');
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

test('a categorised day entry is still the one an event on that day replaces', () => {
  // The dedupe used to key on the kind being "bhgdag". Once a day row can be
  // categorised as info or internt, that test would let the duplicate through
  // — so it keys on the entry's shape instead.
  const merged = mergeCalendarEntries({
    events: [event({ id: 1, date: '2026-09-25', title: 'Foreldredugnad' })],
    entries: [
      entry({ id: 1, entryType: 'day_event', date: '2026-09-25', category: 'info', title: 'Dugnad' }),
    ],
  });

  assert.deepEqual(merged.map((e) => e.title), ['Foreldredugnad']);
});

test('a categorised entry carries its category as the kind it shows', () => {
  const merged = mergeCalendarEntries({
    entries: [
      entry({ id: 1, entryType: 'day_event', date: '2026-04-16', category: 'info', title: 'Frist sommerferie' }),
      entry({ id: 2, entryType: 'day_event', date: '2026-02-08', category: 'internt', title: 'SU' }),
      entry({ id: 3, entryType: 'day_event', date: '2026-10-29', title: 'Uten kategori' }),
    ],
  });

  assert.deepEqual(
    merged.map((e) => [e.title, e.kind]),
    [
      ['SU', 'internt'],
      ['Frist sommerferie', 'info'],
      ['Uten kategori', 'bhgdag'],
    ],
  );
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

test('the week band orders varmmat first wherever it is rendered', () => {
  const merged = mergeCalendarEntries({
    entries: [
      entry({ id: 1, entryType: 'week_event', weekNumber: 39, title: 'Brannvernuke' }),
      entry({ id: 2, entryType: 'note', weekNumber: 39, title: 'Uteuke' }),
      entry({ id: 3, entryType: 'food', weekNumber: 39, title: 'Fiskesuppe' }),
    ],
  });

  // The list groups and sorts for itself; the month grid's week rail sorts the
  // same entries with the same comparator, so the two must agree.
  const fromList = groupCalendarEntriesByWeek(merged)[0].spanning.map((e) => e.title);
  const fromRail = [...merged].sort(compareSpanningEntries).map((e) => e.title);

  assert.deepEqual(fromList, ['Fiskesuppe', 'Brannvernuke', 'Uteuke']);
  assert.deepEqual(fromRail, fromList);
});

test('a kindergarten year runs August to July with no week lost or doubled', () => {
  const weeks = schoolYearWeeks(2026);

  assert.equal(weeks[0].month, 8);
  assert.equal(weeks[0].year, 2026);
  assert.equal(weeks[weeks.length - 1].month, 7);
  assert.equal(weeks[weeks.length - 1].year, 2027);

  // 52 or 53 weeks, every one starting on a Monday, seven days apart.
  assert.ok(weeks.length >= 52 && weeks.length <= 53, `got ${weeks.length} weeks`);
  for (const week of weeks) assert.equal(week.monday.getDay(), 1);
  for (let i = 1; i < weeks.length; i++) {
    assert.equal(Math.round((weeks[i].monday - weeks[i - 1].monday) / 86400000), 7);
  }

  // Each (weekYear, week) appears exactly once — a week straddling two months
  // belongs to the month of its Thursday, not to both.
  const keys = weeks.map((w) => calendarWeekKey(w.weekYear, w.week));
  assert.equal(new Set(keys).size, keys.length);

  // Months appear in kindergarten-year order, August first and January in the
  // new calendar year.
  assert.deepEqual([...new Set(weeks.map((w) => w.month))], [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(weeks.filter((w) => w.month === 1).every((w) => w.year === 2027));
});

test('the school year covers the weeks its own entries fall in', () => {
  const weeks = schoolYearWeeks(2026);
  const keys = new Set(weeks.map((w) => calendarWeekKey(w.weekYear, w.week)));

  const merged = mergeCalendarEntries({
    events: [
      event({ id: 1, date: '2026-09-25' }),
      event({ id: 2, date: '2026-12-30', type: 'event' }),
      event({ id: 3, date: '2027-06-11', type: 'event' }),
    ],
    entries: [entry({ id: 1, year: 2026, month: 12, weekNumber: 53 })],
  });

  for (const item of merged) {
    assert.ok(keys.has(calendarWeekKey(item.weekYear, item.week)), `${item.title} fell outside the year`);
  }
});

test('parents and children stays distinct across events and dated calendar entries', () => {
  const familyEvent = normalizeEvent(event({ type: 'family', title: 'Lysfesten' }));
  const familyEntry = normalizeYearlyEntry(entry({
    entryType: 'day_event', category: 'family', date: '2026-09-25',
  }));
  assert.equal(familyEvent.kind, 'family');
  assert.equal(familyEvent.displayKind, 'family');
  assert.equal(familyEntry.displayKind, 'family');
  assert.equal(normalizeEvent(event({ type: 'meeting' })).displayKind, 'arrangement');
  assert.equal(normalizeEvent(event({ type: 'activity' })).displayKind, 'bhgdag');
  assert.equal(normalizeYearlyEntry(entry({
    entryType: 'closed', category: 'family', date: '2026-09-25',
  })).displayKind, 'stengt');
});

test('family is accepted by the API type list and offered in calendar filters', async () => {
  const { EVENT_TYPES } = await import('../shared/constants.js');
  const { CALENDAR_DISPLAY_KINDS, YEARLY_CALENDAR_CATEGORIES } = await import('../shared/calendar-entries.js');
  assert.ok(EVENT_TYPES.includes('family'));
  assert.ok(CALENDAR_DISPLAY_KINDS.includes('family'));
  assert.ok(YEARLY_CALENDAR_CATEGORIES.includes('family'));
});

// Display groups: the four chips the calendar and homepage filter by.

test('day categories group legacy kinds without hiding internal meetings', () => {
  for (const kind of ['arrangement', 'mote', 'dugnad']) assert.equal(calendarDisplayKind(kind), 'arrangement');
  for (const kind of ['bhgdag', 'varmmat', 'temauke', 'foto']) assert.equal(calendarDisplayKind(kind), 'bhgdag');
  for (const kind of ['info', 'beskjed', 'stengt']) assert.equal(calendarDisplayKind(kind), 'info');
  assert.equal(calendarDisplayKind('internt'), 'internt');
});

test('legacy parent flag supplies a group only when no explicit category exists', () => {
  const row = { id: 1, title: 'FORUT', entryType: 'day_event', date: '2026-10-29', showForParents: true };
  assert.equal(normalizeYearlyEntry(row).displayKind, 'arrangement');
  assert.equal(normalizeYearlyEntry({ ...row, category: 'info' }).displayKind, 'info');
  assert.equal(normalizeYearlyEntry({ ...row, category: 'internt' }).displayKind, 'internt');
  assert.equal(normalizeYearlyEntry({ ...row, category: 'bhgdag' }).displayKind, 'bhgdag');
  assert.equal(normalizeYearlyEntry({ ...row, showForParents: false }).displayKind, 'bhgdag');
});

test('photo events retain their special signup type under the For children label', () => {
  const photo = { id: 9, title: 'Fotografering', date: '2026-11-10', type: 'foto', noSignup: false, vigiloSignup: false };
  const normalized = normalizeEvent(photo);
  assert.equal(normalized.kind, 'foto');
  assert.equal(normalized.displayKind, 'bhgdag');
  assert.equal(normalized.signup.mode, 'registration');
  assert.equal(normalized.event.type, 'foto', 'The signup modal receives the original photo type');
});

test('non-day entries keep their type label even with a previously saved category', () => {
  for (const [entryType, expected] of [['closed', 'stengt'], ['food', 'varmmat'], ['week_event', 'temauke'], ['note', 'beskjed']]) {
    for (const category of [null, 'info', 'internt', 'arrangement']) {
      const row = { id: 8, title: 'Oppføring', year: 2026, month: 11, weekNumber: 45,
        entryType, category, showForParents: true, date: entryType === 'closed' ? '2026-11-06' : null };
      assert.equal(calendarDisplayKindForEntry(row), expected, 'Homepage label follows the non-day type');
      assert.equal(normalizeYearlyEntry(row).displayKind, expected, 'Calendar uses the same label');
    }
  }
});

test('internal FAU meetings stay in the public calendar with registration disabled', () => {
  const entry = normalizeEvent({ id: 2, title: 'FAU', date: '2026-10-29', type: 'internal' });
  assert.equal(entry.displayKind, 'internt');
  assert.equal(entry.signup.mode, 'internal');
});

test('events can use the Info and For children categories', () => {
  assert.ok(EVENT_TYPES.includes('info'));
  assert.ok(EVENT_TYPES.includes('activity'));
  assert.equal(normalizeEvent({ id: 3, title: 'Info', date: '2026-10-29', type: 'info' }).displayKind, 'info');
  assert.equal(normalizeEvent({ id: 4, title: 'Tur', date: '2026-10-29', type: 'activity' }).displayKind, 'bhgdag');
});

test('a separate internal meeting is not hidden by an event on the same date', () => {
  const merged = mergeCalendarEntries({
    events: [{ id: 1, title: 'Foreldredugnad', date: '2026-10-29', type: 'dugnad' }],
    entries: [{ id: 2, title: 'SU-møte', date: '2026-10-29', entryType: 'day_event', category: 'internt' }],
  });
  assert.equal(merged.length, 2);
});
