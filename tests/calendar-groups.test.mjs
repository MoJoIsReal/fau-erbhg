import { EVENT_TYPES } from "../shared/constants.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarDisplayKind, mergeCalendarEntries, normalizeEvent, normalizeYearlyEntry } from '../shared/calendar-entries.js';

test('four public groups cover every entry without hiding internal meetings', () => {
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
