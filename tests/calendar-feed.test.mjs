import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCalendarFeed,
  escapeIcsText,
  foldIcsLine,
  toIcsLocalDateTime,
  addHoursToIcsLocalDateTime,
  nextIcsDate,
} from '../shared/calendar-feed.js';

const NOW = new Date('2026-02-01T10:00:00Z');

function signupEvent(overrides = {}) {
  return {
    id: 1,
    title: 'Foreldremøte',
    description: '<p>Velkommen</p>',
    date: '2026-03-29',
    time: '18:00',
    location: 'Barnehagen',
    customLocation: null,
    status: 'active',
    ...overrides,
  };
}

function lines(feed) {
  return feed.split('\r\n');
}

test('feed is a well-formed VCALENDAR carrying an Oslo VTIMEZONE', () => {
  const feed = buildCalendarFeed({ events: [signupEvent()], now: NOW });
  const feedLines = lines(feed);

  assert.equal(feedLines[0], 'BEGIN:VCALENDAR');
  assert.equal(feedLines.at(-2), 'END:VCALENDAR');
  assert.equal(feed.endsWith('\r\n'), true);
  assert.equal(feedLines.includes('TZID:Europe/Oslo'), true);
  assert.equal(feedLines.filter((line) => line === 'BEGIN:VEVENT').length, 1);
  assert.equal(feedLines.filter((line) => line === 'END:VEVENT').length, 1);
});

test('a signup event keeps Oslo wall-clock time and a stable UID', () => {
  const feed = buildCalendarFeed({ events: [signupEvent()], now: NOW });
  const feedLines = lines(feed);

  assert.equal(feedLines.includes('UID:event-1@erdal-bhg.no'), true);
  assert.equal(feedLines.includes('DTSTART;TZID=Europe/Oslo:20260329T180000'), true);
  // Default two-hour slot, and it must not shift across the DST change that
  // happens on this very date.
  assert.equal(feedLines.includes('DTEND;TZID=Europe/Oslo:20260329T200000'), true);
  assert.equal(feedLines.includes('STATUS:CONFIRMED'), true);
});

test('a cancelled event stays in the feed as cancelled', () => {
  const feed = buildCalendarFeed({ events: [signupEvent({ status: 'cancelled' })], now: NOW });
  assert.equal(lines(feed).includes('STATUS:CANCELLED'), true);
});

test('event HTML description is flattened and the location includes the custom part', () => {
  const feed = buildCalendarFeed({
    events: [signupEvent({
      description: '<p>Hei</p><p>Ta med kaffe</p>',
      customLocation: 'Storsalen',
    })],
    now: NOW,
  });
  const feedLines = lines(feed);

  assert.equal(feedLines.includes('DESCRIPTION:Hei\\n\\nTa med kaffe'), true);
  assert.equal(feedLines.includes('LOCATION:Barnehagen (Storsalen)'), true);
});

test('dated yearly entries become all-day events that do not block the day', () => {
  const feed = buildCalendarFeed({
    entries: [{ id: 5, title: 'Planleggingsdag', entryType: 'closed', date: '2026-04-02' }],
    now: NOW,
  });
  const feedLines = lines(feed);

  assert.equal(feedLines.includes('UID:yearly-5@erdal-bhg.no'), true);
  assert.equal(feedLines.includes('DTSTART;VALUE=DATE:20260402'), true);
  // All-day DTEND is exclusive.
  assert.equal(feedLines.includes('DTEND;VALUE=DATE:20260403'), true);
  assert.equal(feedLines.includes('TRANSP:TRANSPARENT'), true);
  assert.equal(feedLines.includes('SUMMARY:Barnehagen er stengt: Planleggingsdag'), true);
});

test('entries without a usable date are skipped rather than emitted broken', () => {
  const feed = buildCalendarFeed({
    events: [signupEvent({ time: '' }), signupEvent({ id: 2, date: null })],
    entries: [{ id: 9, title: 'Uke 12', entryType: 'day_event', date: null }],
    now: NOW,
  });
  assert.equal(lines(feed).includes('BEGIN:VEVENT'), false);
});

test('text properties escape the characters iCalendar reserves', () => {
  assert.equal(escapeIcsText('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne');
});

test('long lines fold to 75 octets without splitting a multi-byte character', () => {
  const folded = foldIcsLine(`SUMMARY:${'æ'.repeat(100)}`);
  const parts = folded.split('\r\n');

  assert.equal(parts.length > 1, true);
  for (const [index, part] of parts.entries()) {
    assert.equal(Buffer.byteLength(part, 'utf8') <= 75, true);
    if (index > 0) assert.equal(part.startsWith(' '), true);
  }
  assert.equal(parts.map((part, index) => (index === 0 ? part : part.slice(1))).join(''), `SUMMARY:${'æ'.repeat(100)}`);
});

test('date helpers roll over month and year boundaries', () => {
  assert.equal(toIcsLocalDateTime('2026-12-31', '9:05'), '20261231T090500');
  assert.equal(addHoursToIcsLocalDateTime('20261231T230000', 2), '20270101T010000');
  assert.equal(nextIcsDate('20260228'), '20260301');
});
