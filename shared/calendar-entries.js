// One list out of the two sources the calendar shows: signup events
// (`/api/events`, mapEvent shape) and yearly calendar entries
// (`/api/yearly-calendar`, mapEntry shape). The site used to present these as
// two tabs, which meant a parent had to check twice to plan a single week.
//
// Only pure functions live here, so tests/calendar-entries.test.mjs can reach
// them — the same reason yearly-calendar-display.js sits in shared/ rather
// than in client/src/lib/. Nothing in api/ imports this file.
import { isoWeek } from './yearly-calendar-display.js';

// The kinds a merged entry can have. The first five come from `events` and
// only COUNCIL_ROLES may edit them; the last five come from
// `yearly_calendar_entries`, which staff may edit too. That split is also how
// the filter chips are grouped, so it is worth keeping visible.
export const EVENT_CALENDAR_KINDS = ['arrangement', 'mote', 'dugnad', 'foto', 'internt'];
export const YEARLY_CALENDAR_KINDS = ['bhgdag', 'varmmat', 'temauke', 'stengt', 'beskjed'];
export const CALENDAR_ENTRY_KINDS = [...EVENT_CALENDAR_KINDS, ...YEARLY_CALENDAR_KINDS];

// events.type is free text in the DB but the creation modal offers exactly
// these; anything unrecognised is a plain arrangement rather than dropped.
const EVENT_TYPE_TO_KIND = {
  meeting: 'mote',
  dugnad: 'dugnad',
  foto: 'foto',
  internal: 'internt',
  event: 'arrangement',
  annet: 'arrangement',
};

const ENTRY_TYPE_TO_KIND = {
  day_event: 'bhgdag',
  closed: 'stengt',
  food: 'varmmat',
  week_event: 'temauke',
  note: 'beskjed',
};

export function calendarKindForEventType(type) {
  return EVENT_TYPE_TO_KIND[type] ?? 'arrangement';
}

export function calendarKindForEntryType(entryType) {
  return ENTRY_TYPE_TO_KIND[entryType] ?? 'beskjed';
}

export function calendarKindSource(kind) {
  return EVENT_CALENDAR_KINDS.includes(kind) ? 'event' : 'yearly';
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "YYYY-MM-DD" to a local midnight Date. Date columns hold ISO strings on
 * purpose (see AGENTS.md), so parsing them as local rather than UTC is what
 * keeps a Monday from rendering as the Sunday before.
 */
export function parseCalendarDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  // Date rolls an out-of-range value over silently — "2026-13-45" becomes
  // February 2027 — so a row with a nonsense date would land on a real week.
  // Only accept what survives the round trip.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** The year of that week's Thursday, which is what ISO calls the week-year. */
export function isoWeekYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/**
 * Week-based entries carry no date, only the row's own year/month plus a week
 * number — and those disagree at the turn of the year: week 1 can be stored on
 * a December row, week 53 on a January one.
 */
export function isoWeekYearForRow(year, month, weekNumber) {
  if (weekNumber >= 52 && month === 1) return year - 1;
  if (weekNumber <= 1 && month === 12) return year + 1;
  return year;
}

/** Sortable and comparable: 2026 week 39 becomes 202639. */
export function calendarWeekKey(weekYear, weekNumber) {
  return weekYear * 100 + weekNumber;
}

function clampWeek(value) {
  const week = Number(value);
  if (!Number.isInteger(week) || week < 1 || week > 53) return null;
  return week;
}

/**
 * What the signup row should say, without the component re-deriving it.
 * `mode` mirrors the flags on the event: an internal event and one marked
 * noSignup both take no registrations, but they say different things.
 */
export function describeEventSignup(event, now = new Date()) {
  const kind = calendarKindForEventType(event?.type);
  const max = Number.isInteger(event?.maxAttendees) ? event.maxAttendees : null;
  const count = Number.isInteger(event?.currentAttendees) ? event.currentAttendees : 0;

  let mode = 'registration';
  if (kind === 'internt') mode = 'internal';
  else if (event?.vigiloSignup) mode = 'vigilo';
  else if (event?.noSignup) mode = 'none';

  const deadline = event?.registrationDeadline ?? null;
  const deadlineDate = deadline ? new Date(deadline) : null;
  const deadlinePassed = !!deadlineDate
    && !Number.isNaN(deadlineDate.getTime())
    && deadlineDate.getTime() < now.getTime();

  return {
    mode,
    maxAttendees: max,
    currentAttendees: count,
    spotsLeft: max === null ? null : Math.max(0, max - count),
    isFull: max !== null && count >= max,
    deadline,
    deadlinePassed,
    // Only a registration event can actually be closed for signup.
    isOpen: mode === 'registration' && !deadlinePassed && !(max !== null && count >= max),
  };
}

function baseEntry(fields) {
  const weekKey = calendarWeekKey(fields.weekYear, fields.week);
  const weekEndKey = calendarWeekKey(fields.weekYear, fields.weekEnd);
  return {
    ...fields,
    weekKey,
    weekEndKey,
    // Within a week, dated entries sort by weekday and week-wide ones come
    // first — they are the frame the days sit inside.
    sortKey: weekKey * 10 + (fields.date ? (parseCalendarDate(fields.date).getDay() || 7) : 0),
  };
}

export function normalizeEvent(event, now = new Date()) {
  const date = parseCalendarDate(event?.date);
  if (!date) return null;
  const week = isoWeek(date);
  const weekYear = isoWeekYear(date);

  return baseEntry({
    id: `event-${event.id}`,
    sourceId: event.id,
    source: 'event',
    kind: calendarKindForEventType(event.type),
    title: event.title,
    description: event.description ?? '',
    date: event.date,
    startTime: event.time ?? null,
    endTime: null,
    location: event.customLocation || event.location || '',
    week,
    weekEnd: week,
    weekYear,
    weekdayStart: null,
    weekdayEnd: null,
    cancelled: event.status === 'cancelled',
    signup: describeEventSignup(event, now),
    color: null,
    event,
    entry: null,
  });
}

export function normalizeYearlyEntry(entry) {
  const kind = calendarKindForEntryType(entry?.entryType);
  const date = parseCalendarDate(entry?.date);

  if (date) {
    const week = isoWeek(date);
    return baseEntry({
      id: `entry-${entry.id}`,
      sourceId: entry.id,
      source: 'yearly',
      kind,
      title: entry.title,
      description: entry.description ?? '',
      date: entry.date,
      startTime: entry.startTime ?? null,
      endTime: entry.endTime ?? null,
      location: '',
      week,
      weekEnd: week,
      weekYear: isoWeekYear(date),
      weekdayStart: null,
      weekdayEnd: null,
      cancelled: false,
      signup: null,
      color: entry.color ?? null,
      event: null,
      entry,
    });
  }

  const week = clampWeek(entry?.weekNumber);
  // A dateless entry with no usable week has nowhere to go in a week list.
  if (week === null) return null;
  const endCandidate = clampWeek(entry?.weekNumberEnd);
  const weekEnd = endCandidate !== null && endCandidate > week ? endCandidate : week;

  return baseEntry({
    id: `entry-${entry.id}`,
    sourceId: entry.id,
    source: 'yearly',
    kind,
    title: entry.title,
    description: entry.description ?? '',
    date: null,
    startTime: entry.startTime ?? null,
    endTime: entry.endTime ?? null,
    location: '',
    week,
    weekEnd,
    weekYear: isoWeekYearForRow(entry.year, entry.month, week),
    weekdayStart: entry.weekdayStart ?? null,
    weekdayEnd: entry.weekdayEnd ?? null,
    cancelled: false,
    signup: null,
    color: entry.color ?? null,
    event: null,
    entry,
  });
}

/**
 * The printed årskalender usually writes the same happening up twice: once as
 * a signup event with time, place and description, and once as a plain
 * day_event row. Listing both turns the calendar into pairs of near-duplicates
 * ("Høstdugnad" right next to "Foreldredugnad i regi av FAU"), so the event
 * wins and the day_event is dropped — the same rule useUpcomingItems applies
 * on the homepage. "Stengt" is never a duplicate of an event, even on a day
 * that has one, so it always survives.
 */
export function dropDayEntriesCoveredByEvents(entries) {
  const daysWithEvent = new Set(
    entries.filter((item) => item.source === 'event' && item.date).map((item) => item.date),
  );
  if (daysWithEvent.size === 0) return entries;
  return entries.filter(
    (item) => !(item.source === 'yearly' && item.kind === 'bhgdag' && daysWithEvent.has(item.date)),
  );
}

/**
 * Both sources in one sorted list. Rows that cannot be placed on a week — an
 * event with an unparseable date, a note with no week number — are dropped
 * rather than piled at the top.
 */
export function mergeCalendarEntries({ events = [], entries = [], now = new Date() } = {}) {
  const merged = [];
  for (const event of events) {
    const normalized = normalizeEvent(event, now);
    if (normalized) merged.push(normalized);
  }
  for (const entry of entries) {
    const normalized = normalizeYearlyEntry(entry);
    if (normalized) merged.push(normalized);
  }
  // Dedupe on id so overlapping school-year fetches cannot list an entry twice.
  const seen = new Set();
  const unique = merged.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return dropDayEntriesCoveredByEvents(unique)
    .sort((a, b) => a.sortKey - b.sortKey || a.title.localeCompare(b.title, 'no'));
}

/**
 * Weeks that actually hold something, in order. `spanning` is what lasts the
 * whole week (varmmat, temauke, beskjed) and `dated` is what happens on a day;
 * keeping them apart is what lets one list carry both calendars without
 * pretending a week of hot meals happened on a Monday.
 */
/**
 * Ukens varmmat leads the week band, as it does in the yearly calendar's own
 * sortByTypeAndColor — it is the one line a parent looks for every week.
 * Exported so the month grid's week rail orders its entries the same way the
 * week list does; the two are the same band in two shapes.
 */
export function compareSpanningEntries(a, b) {
  const rank = (item) => (item.kind === 'varmmat' ? 0 : 1);
  return rank(a) - rank(b) || a.title.localeCompare(b.title, 'no');
}

export function groupCalendarEntriesByWeek(entries, { fromWeekKey = null } = {}) {
  const byWeek = new Map();

  const touch = (weekYear, week) => {
    const key = calendarWeekKey(weekYear, week);
    if (fromWeekKey !== null && key < fromWeekKey) return null;
    let group = byWeek.get(key);
    if (!group) {
      group = { weekKey: key, weekYear, week, spanning: [], dated: [] };
      byWeek.set(key, group);
    }
    return group;
  };

  for (const entry of entries) {
    if (entry.date) {
      const group = touch(entry.weekYear, entry.week);
      if (group) group.dated.push(entry);
      continue;
    }
    // A span that started before the cutoff still belongs to the weeks it
    // covers after it — a temauke running weeks 39–41 must show in week 40.
    for (let week = entry.week; week <= entry.weekEnd; week++) {
      const group = touch(entry.weekYear, week);
      if (group) group.spanning.push(entry);
    }
  }

  return [...byWeek.values()]
    .sort((a, b) => a.weekKey - b.weekKey)
    .map((group) => ({
      ...group,
      spanning: group.spanning.sort(compareSpanningEntries),
      dated: group.dated.sort((a, b) => a.sortKey - b.sortKey || a.title.localeCompare(b.title, 'no')),
    }));
}

/** Monday of a given ISO week, for labelling a week with its date range. */
export function mondayOfIsoWeek(weekYear, weekNumber) {
  const jan4 = new Date(weekYear, 0, 4);
  const dayNum = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayNum + 1 + (weekNumber - 1) * 7);
  return monday;
}

export function isoWeekRange(weekYear, weekNumber) {
  const start = mondayOfIsoWeek(weekYear, weekNumber);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}
