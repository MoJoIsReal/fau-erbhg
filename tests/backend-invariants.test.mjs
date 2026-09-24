// Source-level guards for backend invariants that no offline test can reach
// through behaviour: the shape of SQL inside handlers. Each one encodes a bug
// that shipped once and failed silently. Behaviour that CAN be exercised
// belongs in the suite for its module, not here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// A backtick inside a SQL comment terminates the JavaScript template literal
// the query lives in. tsc reports it as a bare "',' expected" lines away from
// the real cause, so name it here.
test('no SQL comment contains a backtick', () => {
  const files = [
    'api/registrations.js', 'api/events.js', 'api/contact.js', 'api/documents.js',
    'api/auth.js', 'api/upload.js', 'api/yearly-calendar.js', 'api/secure-settings.js',
    'api/cron/event-reminders.js',
  ];
  for (const file of files) {
    read(file).split('\n').forEach((line, index) => {
      const comment = line.match(/^\s*--\s(.*)$/);
      if (comment?.[1].includes('`')) {
        assert.fail(`${file}:${index + 1} has a backtick inside a SQL comment, which ends the template literal`);
      }
    });
  }
});

// PostgreSQL silently skips a second update of a row already updated by the
// same statement. A compensating rollback CTE therefore never ran, and every
// duplicate signup permanently consumed a seat.
test('the registration statement updates the event row once, gated on an insert, under a lock', () => {
  const source = read('api/registrations.js');
  const start = source.indexOf('WITH target_event AS');
  const end = source.indexOf('AS registration', start);
  assert.ok(start !== -1 && end !== -1, 'Locate the registration CTE');
  const statement = source.slice(start, end);

  assert.equal((statement.match(/UPDATE\s+events\b/g) ?? []).length, 1);
  assert.doesNotMatch(statement, /rollback_capacity/);
  assert.match(statement, /UPDATE events[\s\S]*?EXISTS \(SELECT 1 FROM inserted_registration\)/);
  assert.match(statement, /FOR UPDATE/, 'Concurrent signups for the last seat must serialize on the event row');
});

// DB-002. The stored counter drifts; reads derive the count, but the capacity
// check must keep comparing the locked counter — a single statement's snapshot
// would not see a registration committed by the transaction it waited behind.
test('attendee counts are derived on read and reconciled, while capacity uses the locked counter', () => {
  const eventsApi = read('api/events.js');
  assert.match(eventsApi, /currentAttendees: row\.derived_attendees \?\? row\.current_attendees/);
  const derivations = eventsApi.match(
    /SELECT COALESCE\(SUM\(r\.attendee_count\), 0\)::int[\s\S]{0,120}?AS derived_attendees/g,
  ) ?? [];
  assert.ok(derivations.length >= 4, `Every event read path should derive the count (found ${derivations.length})`);

  assert.match(
    read('api/registrations.js'),
    /COALESCE\(current_attendees, 0\) \+ \$\{requestedAttendees\} <= max_attendees/,
  );

  const cron = read('api/cron/event-reminders.js');
  assert.match(cron, /export async function reconcileEventAttendeeCounts/);
  assert.match(
    cron,
    /WHERE e\.id = d\.id\s*\n\s*AND COALESCE\(e\.current_attendees, 0\) = d\.stored/,
    'Reconciliation must stand down when it races a live registration',
  );
});

// DB-003/DB-004. The outbox never shrank, copied each item body into every
// subscriber row, and kept undeliverable rows pending forever.
test('the newsletter outbox is bounded in attempts, retention and row size', () => {
  const cron = read('api/cron/event-reminders.js');
  assert.match(cron, /const MAX_DELIVERY_ATTEMPTS = \d+/);
  assert.match(cron, /status = \$\{exhausted \? 'failed' : 'pending'\}/);
  assert.match(cron, /DELETE FROM newsletter_deliveries[\s\S]*?status IN \('sent', 'skipped', 'failed'\)/);
  assert.doesNotMatch(cron, /DELETE FROM newsletter_deliveries[\s\S]*?status IN \([^)]*'pending'/);
  assert.match(cron, /SELECT d\.item_type, d\.item_id, s\.id, d\.title, NULL::text, d\.event_date/);
  assert.match(cron, /LEFT JOIN blog_posts bp ON c\.item_type = 'news' AND bp\.id = c\.item_id/);
  assert.match(cron, /entry_type IN \('day_event', 'closed'\)/, 'Closed days are newsletter items too');
});

// Write paths returned raw snake_case rows while reads were camelCase; the
// settings page fed them into state and the next toggle reset publish dates.
test('secure-settings maps every write response through its row mapper', () => {
  const source = read('api/secure-settings.js');
  for (const mapper of ['mapBlogPost', 'mapBoardMember', 'mapKindergartenInfo', 'mapContactMessage']) {
    assert.match(source, new RegExp(`function ${mapper}\\(`));
  }
  const raw = source.match(/return res\.status\((?:200|201)\)\.json\(result\[0\]\)/g) ?? [];
  assert.equal(raw.length, 0, `${raw.length} write path(s) return a raw row instead of a mapped one`);
});

// Unvalidated ids produced 500s, and DELETEs answered "deleted" without
// checking that anything matched.
test('secure-settings validates ids and every delete reports whether a row matched', () => {
  const source = read('api/secure-settings.js');
  assert.doesNotMatch(source, /const \{ id \} = req\.query/, 'Take ids through requireIntId');
  // Compensating deletes undo a row this same request created. Listed
  // explicitly so a NEW unchecked delete fails here and gets looked at.
  const COMPENSATING_DELETES = ['DELETE FROM users WHERE id = ${created[0].id}'];
  for (const block of source.match(/DELETE FROM \w+[\s\S]{0,200}?`;/g) ?? []) {
    if (COMPENSATING_DELETES.some((exempt) => block.includes(exempt))) continue;
    assert.match(block, /RETURNING/, `A DELETE without RETURNING cannot tell a deletion from a no-op:\n${block}`);
  }
});

// A drag writes sort_order, so it sorts first; role is only the tiebreak.
test('board members order by hand first, then by role', () => {
  const query = read('api/secure-settings.js').match(/FROM fau_board_members[\s\S]*?`/);
  assert.ok(query);
  assert.match(
    query[0],
    /ORDER BY sort_order ASC,[\s\S]*CASE role[\s\S]*'Leder' THEN 0[\s\S]*'Medlem' THEN 1[\s\S]*'Vara' THEN 2/,
  );
});

test('the yearly calendar validates, reads back and preserves what the editor saves', () => {
  const source = read('api/yearly-calendar.js');
  assert.match(source, /YEARLY_CALENDAR_CATEGORIES\.includes\(body\.category\)/);
  assert.match(source, /supportsYearlyCalendarNewsletter\(entryType\)/);

  // Omitting category from the read made a saved selection revert to the type default.
  const select = source.match(/async function getEntriesForSchoolYear[\s\S]*?SELECT ([\s\S]*?)FROM yearly_calendar_entries/);
  assert.ok(select, 'Locate the query used to reopen saved entries');
  assert.match(select[1], /\bcategory\b/);

  // The import UPDATE must not clear fields the preview never diffed.
  const start = source.indexOf("if (action === 'update')");
  const updateBlock = source.slice(start, source.indexOf("if (action === 'create')", start));
  assert.doesNotMatch(updateBlock, /weekday_start\s*=/);
});
