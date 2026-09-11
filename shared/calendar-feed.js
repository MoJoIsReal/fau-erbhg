// iCalendar (RFC 5545) feed for the public calendar, so parents can subscribe
// once in their own calendar app instead of adding every event by hand.
//
// The feed is built from the same two sources the site shows: signup events
// (`events`) and dated yearly-calendar entries (`day_event` / `closed`).
// Week-based yearly entries have no date and are deliberately left out.
import { htmlToPlainText } from './html-text.js';

export const CALENDAR_FEED_PATH = '/kalender.ics';
const UID_DOMAIN = 'erdal-bhg.no';
// Events carry a start time but no end time; the site has always assumed a
// two-hour slot when exporting a single event, so the feed does the same.
const DEFAULT_EVENT_DURATION_HOURS = 2;

// Norwegian local time, spelled out so clients that do not carry an Olson
// database still place every event correctly across DST.
const OSLO_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Oslo',
  'X-LIC-LOCATION:Europe/Oslo',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// RFC 5545 caps a content line at 75 octets; longer lines continue on the
// next line prefixed with a single space. Count bytes, but never split a
// multi-byte character (æ, ø, å are two octets each).
export function foldIcsLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts = [];
  let current = '';
  let currentBytes = 0;
  // First line holds 75 octets, continuation lines 74 (the leading space).
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += charBytes;
  }
  parts.push(current);

  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join('\r\n');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

// "YYYY-MM-DD" → "YYYYMMDD" for all-day (VALUE=DATE) properties.
export function toIcsDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  return match ? `${match[1]}${match[2]}${match[3]}` : null;
}

// Local wall-clock stamp used together with TZID=Europe/Oslo.
export function toIcsLocalDateTime(dateStr, timeStr) {
  const date = toIcsDate(dateStr);
  if (!date) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ''));
  if (!match) return null;
  return `${date}T${pad(match[1])}${pad(match[2])}00`;
}

export function addHoursToIcsLocalDateTime(stamp, hours) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(String(stamp || ''));
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  // UTC arithmetic on wall-clock parts: this only shifts the clock reading,
  // the TZID on the property is what anchors it to Oslo time.
  const shifted = new Date(Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    Number(hour) + hours, Number(minute), Number(second),
  ));
  return `${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth() + 1)}${pad(shifted.getUTCDate())}`
    + `T${pad(shifted.getUTCHours())}${pad(shifted.getUTCMinutes())}${pad(shifted.getUTCSeconds())}`;
}

// All-day events are exclusive at the end: a single day ends the next day.
export function nextIcsDate(dateStamp) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(dateStamp || ''));
  if (!match) return null;
  const [, year, month, day] = match;
  const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
}

function toIcsUtcStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function eventLocation(event) {
  if (!event.location) return '';
  return event.customLocation ? `${event.location} (${event.customLocation})` : event.location;
}

function eventDescription(event, baseUrl) {
  const text = htmlToPlainText(event.description);
  if (!baseUrl) return text;
  const link = `${baseUrl}/kalender`;
  return text ? `${text}\n\n${link}` : link;
}

function signupEventLines(event, { dtstamp, baseUrl }) {
  const start = toIcsLocalDateTime(event.date, event.time);
  if (!start) return null;
  const end = addHoursToIcsLocalDateTime(start, DEFAULT_EVENT_DURATION_HOURS);

  const lines = [
    'BEGIN:VEVENT',
    `UID:event-${event.id}@${UID_DOMAIN}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=Europe/Oslo:${start}`,
    `DTEND;TZID=Europe/Oslo:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  const description = eventDescription(event, baseUrl);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

  const location = eventLocation(event);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);

  if (baseUrl) lines.push(`URL:${baseUrl}/kalender`);
  // Cancelled events stay in the feed as STATUS:CANCELLED so subscribers see
  // the cancellation instead of the entry silently disappearing.
  lines.push(`STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('END:VEVENT');
  return lines;
}

function yearlyEntryLines(entry, { dtstamp, baseUrl, language }) {
  const start = toIcsDate(entry.date);
  if (!start) return null;

  const closedPrefix = language === 'en' ? 'Kindergarten closed' : 'Barnehagen er stengt';
  const summary = entry.entryType === 'closed' ? `${closedPrefix}: ${entry.title}` : entry.title;

  const lines = [
    'BEGIN:VEVENT',
    `UID:yearly-${entry.id}@${UID_DOMAIN}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${nextIcsDate(start)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
  ];

  const description = htmlToPlainText(entry.description);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (baseUrl) lines.push(`URL:${baseUrl}/kalender/arskalender`);
  // All-day kindergarten dates should not mark a parent as busy all day.
  lines.push('TRANSP:TRANSPARENT');
  lines.push('STATUS:CONFIRMED');
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Build the subscribable calendar feed.
 *
 * @param {Object} input
 * @param {Array} input.events Signup events (mapEvent shape)
 * @param {Array} input.entries Dated yearly calendar entries (mapEntry shape)
 * @param {string} [input.baseUrl] Public site origin, used for URL properties
 * @param {string} [input.language] "no" (default) or "en", for the few fixed labels
 * @param {string} [input.calendarName] X-WR-CALNAME value
 * @param {Date} [input.now] Injected for deterministic tests
 * @returns {string} CRLF-delimited iCalendar document
 */
export function buildCalendarFeed({
  events = [],
  entries = [],
  baseUrl = '',
  language = 'no',
  calendarName = language === 'en' ? 'FAU Erdal Kindergarten' : 'FAU Erdal Barnehage',
  now = new Date(),
} = {}) {
  const dtstamp = toIcsUtcStamp(now);
  const context = {
    dtstamp,
    baseUrl: String(baseUrl || '').replace(/\/+$/, ''),
    language: language === 'en' ? 'en' : 'no',
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FAU Erdal Barnehage//Kalender//NO',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Oslo',
    // Both spellings exist in the wild; clients pick whichever they know.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...OSLO_VTIMEZONE,
  ];

  for (const event of events) {
    const eventLines = signupEventLines(event, context);
    if (eventLines) lines.push(...eventLines);
  }

  for (const entry of entries) {
    const entryLines = yearlyEntryLines(entry, context);
    if (entryLines) lines.push(...entryLines);
  }

  lines.push('END:VCALENDAR');

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
