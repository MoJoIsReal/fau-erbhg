import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanupPrivacyRetention,
  isAuthorizedCron,
  runMorningTasks,
  sendEventReminders,
} from '../api/cron/event-reminders.js';

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

// TEST-002. The claim's guards are what make a reminder go out exactly once:
// a stamped row is never selected again, and a claimed one only once its
// 10-minute lease has run out. Both halves of the claim — the SELECT … FOR
// UPDATE and the UPDATE that stamps the lease — must carry them, or a row
// sent between the two could be claimed a second time. The statement itself
// was executed against PostgreSQL 16 (stamped, live-lease and expired-lease
// rows) when this suite was written; the fake can only pin its shape.
test('the claim only selects unsent rows whose lease has expired', async () => {
  const { sql, calls } = scriptedSql([[]]);
  await sendEventReminders(sql, '2026-09-10', async () => {});

  const claim = calls.find(({ statement }) => statement.includes('WITH due AS'));
  assert.ok(claim, 'the run should issue the claim');
  assert.deepEqual(claim.values.slice(0, 1), ['2026-09-10'], 'the claim is scoped to the target date');
  const [select, update] = claim.statement.split('claimed AS');
  for (const [half, text] of [['select', select], ['update', update]]) {
    assert.match(text, /reminder_sent_at IS NULL/, `the ${half} must skip already-sent rows`);
    assert.match(
      text,
      /reminder_claimed_at IS NULL OR r\.reminder_claimed_at < NOW\(\) - INTERVAL '10 minutes'/,
      `the ${half} must honour a live lease and reclaim an expired one`,
    );
  }
  assert.match(select, /FOR UPDATE OF r SKIP LOCKED/, 'concurrent runs must not claim the same row');
});

// The retention windows are irreversible deletes of personal data, so their
// bounds are pinned: registrations go 6 months after their event, contact
// messages after 12 months, and nothing else is touched.
test('privacy retention deletes only past its windows', async () => {
  const statements = [];
  const sql = async (strings) => {
    statements.push(strings.join('?').replace(/\s+/g, ' ').trim());
    return statements.length === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }];
  };

  const result = await cleanupPrivacyRetention(sql);

  assert.deepEqual(result, {
    contactMessagesDeleted: 2,
    eventRegistrationsDeleted: 1,
    registrationCancellationsDeleted: 1,
  });
  assert.equal(statements.length, 3);
  assert.match(statements[0], /^DELETE FROM contact_messages WHERE created_at::timestamptz < NOW\(\) - INTERVAL '12 months'/);
  assert.match(statements[1], /^DELETE FROM event_registrations r USING events e WHERE e\.id = r\.event_id AND e\.date::date < CURRENT_DATE - INTERVAL '6 months'/);
  assert.match(statements[2], /^DELETE FROM event_registration_cancellations c USING events e WHERE e\.id = c\.event_id AND e\.date::date < CURRENT_DATE - INTERVAL '6 months'/);
});

// The morning run is reminders first, then housekeeping. A reminder the
// provider rejects is released for a later run, and it must not cost the
// run its GDPR retention delete.
test('the morning run still runs retention after a provider failure', async () => {
  const { sql, calls } = scriptedSql([[registration(1), registration(2)]]);

  const result = await runMorningTasks(sql, '2026-09-10', async (message) => {
    if (message.to === 'parent1@example.test') throw new Error('SMTP temporarily unavailable');
  });

  assert.deepEqual(result.reminders, { claimed: 2, sent: 1, failed: 1 });
  assert.deepEqual(result.retention, {
    contactMessagesDeleted: 0,
    eventRegistrationsDeleted: 0,
    registrationCancellationsDeleted: 0,
  });

  const order = [
    'WITH due AS',
    'DELETE FROM contact_messages',
    'DELETE FROM event_registrations',
    'UPDATE events e SET current_attendees',
    'DELETE FROM api_rate_limits',
    'DELETE FROM newsletter_deliveries',
  ].map((needle) => calls.findIndex(({ statement }) => statement.includes(needle)));
  assert.ok(order.every((index) => index >= 0), 'every morning task should run');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'reminders, then retention, then reconcile and cleanup');
});

// SEC-004. Without CRON_SECRET this used to authorize anyone whenever NODE_ENV
// was not exactly 'production'. An anonymous GET to this route sends mail and
// runs the irreversible GDPR retention DELETE, against a caller-supplied
// ?date=, so a preview deployment — or a production deployment that simply
// never had NODE_ENV set — was wide open.
test('cron authorization fails closed when no secret is configured', async (t) => {
  const previousSecret = process.env.CRON_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  delete process.env.CRON_SECRET;

  for (const nodeEnv of ['development', 'preview', 'production', undefined]) {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;

    assert.equal(
      isAuthorizedCron({ headers: {} }),
      false,
      `an unauthenticated cron request must be rejected with NODE_ENV=${nodeEnv}`,
    );
    assert.equal(
      isAuthorizedCron({ headers: { authorization: 'Bearer anything' } }),
      false,
      `no secret means no bearer token can match with NODE_ENV=${nodeEnv}`,
    );
  }
});

test('cron authorization accepts only the configured secret', async (t) => {
  const previousSecret = process.env.CRON_SECRET;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  process.env.CRON_SECRET = 'a-test-only-cron-secret';

  assert.equal(
    isAuthorizedCron({ headers: { authorization: 'Bearer a-test-only-cron-secret' } }),
    true,
  );
  assert.equal(isAuthorizedCron({ headers: { authorization: 'Bearer wrong' } }), false);
  assert.equal(isAuthorizedCron({ headers: {} }), false);
  assert.equal(isAuthorizedCron({}), false);
});
