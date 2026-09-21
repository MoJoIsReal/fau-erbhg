import assert from 'node:assert/strict';
import test from 'node:test';
import { sendEventReminders } from '../api/cron/event-reminders.js';

process.env.GMAIL_USER = 'sender@example.test';
process.env.GMAIL_APP_PASSWORD = 'test-only-password';

function registration(id, overrides = {}) {
  return {
    id,
    name: `Forelder ${id}`,
    email: `parent${id}@example.test`,
    language: 'no',
    attendeeCount: 1,
    photoSlots: null,
    eventTitle: 'Dugnad',
    eventDate: '2026-09-10',
    eventTime: '17:00',
    location: 'Barnehagen',
    customLocation: null,
    reminderAttempts: 1,
    ...overrides,
  };
}

// The claim query is issued repeatedly, so the fake hands out one batch at a
// time and then an empty batch, exactly as the real queue drains.
function scriptedSql(batches) {
  const calls = [];
  const queue = [...batches];
  const sql = async (strings, ...values) => {
    const statement = strings.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ statement, values });
    if (statement.includes('WITH due AS')) return queue.shift() ?? [];
    return [];
  };
  return { sql, calls };
}

test('every claimed reminder is sent and stamped', async () => {
  const { sql, calls } = scriptedSql([[registration(1), registration(2)]]);
  const sent = [];

  const result = await sendEventReminders(sql, '2026-09-10', async (message) => {
    sent.push(message);
  });

  assert.deepEqual({ claimed: result.claimed, sent: result.sent, failed: result.failed },
    { claimed: 2, sent: 2, failed: 0 });
  assert.equal(sent.length, 2);
  assert.match(sent[0].messageId, /^<[a-f0-9]{64}@erdal-bhg\.no>$/);
  assert.equal(
    calls.filter(({ statement }) => statement.includes('SET reminder_sent_at = NOW()')).length,
    2,
  );
});

// A single pass with LIMIT 25 meant an event with more registrations than that
// silently reminded only the first 25 — the next run computes a new targetDate,
// the event is no longer "tomorrow", and reminder_sent_at stays NULL forever.
// The response said `sent: 25`, which looked healthy.
test('reminders continue past one batch until the queue is drained', async () => {
  const full = Array.from({ length: 100 }, (_, index) => registration(index + 1));
  const remainder = Array.from({ length: 20 }, (_, index) => registration(index + 101));
  const { sql } = scriptedSql([full, remainder]);
  let sendCount = 0;

  const result = await sendEventReminders(sql, '2026-09-10', async () => { sendCount += 1; });

  assert.equal(result.claimed, 120, 'both batches should be claimed');
  assert.equal(result.sent, 120, 'every registration in the event should be reminded');
  assert.equal(sendCount, 120);
});

test('a provider failure releases the claim, counts, and does not stop the run', async () => {
  const { sql, calls } = scriptedSql([[registration(1), registration(2), registration(3)]]);

  const result = await sendEventReminders(sql, '2026-09-10', async (message) => {
    if (message.to === 'parent2@example.test') throw new Error('SMTP temporarily unavailable');
  });

  assert.equal(result.sent, 2);
  assert.equal(result.failed, 1);
  // The failed one is released for a later run, never stamped as sent.
  assert.equal(
    calls.filter(({ statement }) => statement.includes('SET reminder_claimed_at = NULL')).length,
    1,
  );
  assert.equal(
    calls.filter(({ statement }) => statement.includes('SET reminder_sent_at = NOW()')).length,
    2,
  );
});

test('nothing due is a clean no-op', async () => {
  const { sql } = scriptedSql([[]]);
  const result = await sendEventReminders(sql, '2026-09-10', async () => {
    assert.fail('should not send when nothing is due');
  });
  assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0 });
});

// Being killed at maxDuration leaves rows claimed with no send record; the run
// budget makes it stop and release them itself.
test('the run stops claiming once the budget is spent', async () => {
  const { sql, calls } = scriptedSql([[registration(1)]]);
  const result = await sendEventReminders(sql, '2026-09-10', async () => {
    assert.fail('should not send after the deadline');
  }, Date.now() - 1);

  assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0 });
  assert.equal(calls.length, 0, 'an expired budget should not even claim a batch');
});
