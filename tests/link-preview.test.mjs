import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeWhen,
  escapeHtml,
  parseSharedEntryId,
  previewFor,
  renderLinkPreview,
} from '../api/_shared/link-preview.js';
import { normalizeEvent, normalizeYearlyEntry } from '../shared/calendar-entries.js';

const NOW = new Date('2026-10-05T08:00:00Z');
const BASE = 'https://www.erdal-bhg.no';

function event(overrides = {}) {
  return {
    id: 12,
    title: 'Foreldrefest i Grendahuset! 🎉',
    description: '<p>Ta med noe godt å spise til <b>fellesbordet</b>.</p>',
    date: '2026-11-07',
    time: '18:00',
    location: 'Annet',
    customLocation: 'Grendahuset Erdal',
    maxAttendees: 60,
    currentAttendees: 0,
    registrationDeadline: null,
    type: 'arrangement',
    status: 'active',
    vigiloSignup: false,
    noSignup: false,
    ...overrides,
  };
}

function entry(overrides = {}) {
  return {
    id: 5, title: 'Brannvernuke', description: null, entryType: 'week_event', category: null,
    year: 2026, month: 9, weekNumber: 39, weekNumberEnd: 41, date: null, startTime: null, endTime: null,
    ...overrides,
  };
}

test('only the two id shapes the site hands out are read as a shared entry', () => {
  assert.deepEqual(parseSharedEntryId('event-12'), { source: 'event', id: 12 });
  assert.deepEqual(parseSharedEntryId('entry-5'), { source: 'yearly', id: 5 });
  // A rewrite can pass the parameter on twice.
  assert.deepEqual(parseSharedEntryId(['event-12', 'event-12']), { source: 'event', id: 12 });
  for (const value of ['event-0', 'event-012', 'event-1.5', 'event-12abc', 'yearly-5', 'event-1234567890', '', undefined, null]) {
    assert.equal(parseSharedEntryId(value), null, `${JSON.stringify(value)} is not a shared id`);
  }
});

test('a dated entry says the day and time, and the year only when it is not this one', () => {
  assert.equal(describeWhen(normalizeEvent(event(), NOW), NOW), 'lørdag 7. november kl. 18:00');
  const closed = normalizeYearlyEntry(entry({ entryType: 'closed', date: '2027-01-04', weekNumber: null, weekNumberEnd: null }));
  assert.equal(describeWhen(closed, NOW), 'mandag 4. januar 2027');
});

test('a week-long entry says its weeks and the dates they cover', () => {
  assert.equal(describeWhen(normalizeYearlyEntry(entry()), NOW), 'Uke 39–41 (21. sep. – 11. okt.)');
});

test('the description leads with when and where, then the text, within the preview length', () => {
  const preview = previewFor({ source: 'event', id: 12 }, event(), NOW);
  assert.equal(preview.title, 'Foreldrefest i Grendahuset! 🎉');
  assert.equal(
    preview.description,
    'Lørdag 7. november kl. 18:00 · Grendahuset Erdal. Ta med noe godt å spise til fellesbordet.',
  );
  assert.equal(preview.path, '/kalender?vis=event-12');

  const long = previewFor({ source: 'event', id: 12 }, event({ description: `<p>${'ord '.repeat(200)}</p>` }), NOW);
  assert.ok(long.description.length <= 200);
  assert.ok(long.description.endsWith('…'));
});

test('a cancelled event and a closed day say so first', () => {
  assert.match(previewFor({ source: 'event', id: 12 }, event({ status: 'cancelled' }), NOW).description, /^Avlyst · /);
  const closed = entry({ entryType: 'closed', title: 'Planleggingsdag', date: '2026-11-06', weekNumber: null, weekNumberEnd: null });
  assert.equal(previewFor({ source: 'yearly', id: 5 }, closed, NOW).description, 'Barnehagen er stengt · fredag 6. november');
});

test('an entry that is gone previews as the calendar its link still opens', () => {
  for (const preview of [previewFor(null, null, NOW), previewFor({ source: 'event', id: 99 }, null, NOW)]) {
    assert.equal(preview.title, 'Kalender');
    assert.equal(preview.path, '/kalender');
  }
});

test('the page carries Open Graph tags and escapes every value it was given', () => {
  const html = renderLinkPreview(
    { title: '"><script>alert(1)</script>', description: "Ole's & Dole's", path: '/kalender?vis=event-12' },
    BASE,
  );
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /<meta property="og:title" content="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;">/);
  assert.match(html, /<meta property="og:description" content="Ole&#39;s &amp; Dole&#39;s">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/www\.erdal-bhg\.no\/kalender\?vis=event-12">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.erdal-bhg\.no\/og-calendar\.jpg">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});
