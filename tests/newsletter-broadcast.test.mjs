import assert from 'node:assert/strict';
import test from 'node:test';
import { broadcastNewsletter } from '../api/cron/event-reminders.js';

process.env.GMAIL_USER = 'sender@example.test';
process.env.GMAIL_APP_PASSWORD = 'test-only-password';

function delivery(overrides = {}) {
  return {
    id: 17,
    title: 'Foreldremøte',
    description: '<p>Velkommen</p>',
    eventDate: '2026-09-10',
    attempts: 1,
    email: 'parent@example.test',
    language: 'no',
    subscriberStatus: 'active',
    unsubscribeToken: 'a'.repeat(64),
    ...overrides,
  };
}

// The release statement now parameterizes the status it writes, because a
// delivery that has run out of attempts is retired to 'failed' rather than put
// back as 'pending'. Asserting on the bound value rather than on the SQL text
// says which of the two actually happened.
function releasedStatus(calls) {
  const release = calls.find(({ statement }) =>
    statement.includes('SET status = ?, claimed_at = NULL'));
  return release ? release.values[0] : null;
}

function scriptedSql(claimedDeliveries, remaining = 0) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const statement = strings.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ statement, values });
    if (statement.includes('INSERT INTO newsletter_deliveries')) return [{ id: 99 }];
    if (statement.includes('WITH candidates AS')) return claimedDeliveries;
    if (statement.startsWith('SELECT COUNT(*)::int AS count')) return [{ count: remaining }];
    return [];
  };
  return { sql, calls };
}

test('newsletter outbox marks a delivery sent only after the provider accepts it', async () => {
  const { sql, calls } = scriptedSql([delivery()]);
  const sentMessages = [];

  const result = await broadcastNewsletter(sql, '2026-09-10', async (message) => {
    sentMessages.push(message);
  });

  assert.deepEqual(
    { queued: result.queued, processed: result.processed, sent: result.sent, failed: result.failed },
    { queued: 1, processed: 1, sent: 1, failed: 0 },
  );
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].messageId, /^<[a-f0-9]{64}@erdal-bhg\.no>$/);
  assert.equal(
    calls.some(({ statement }) => statement.includes("SET status = 'sent', sent_at = NOW()")),
    true,
  );
});

test('newsletter outbox releases a failed delivery with backoff and does not mark it sent', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { sql, calls } = scriptedSql([delivery()], 1);

  const result = await broadcastNewsletter(sql, '2026-09-10', async () => {
    throw new Error('SMTP temporarily unavailable');
  });

  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.remaining, 1);
  assert.equal(releasedStatus(calls), 'pending');
  assert.equal(
    calls.some(({ statement }) => statement.includes("SET status = 'sent', sent_at = NOW()")),
    false,
  );
});

// The production-gated branch is the one that shipped a ReferenceError: the
// failure test above passes under node:test because NODE_ENV is unset there, so
// `if (NODE_ENV === 'production')` never ran and never touched the undefined
// name. Re-running the same failure with NODE_ENV=production is what would have
// caught it, so it is pinned here.
test('a failed delivery still reports to the error tracker under NODE_ENV=production', async (t) => {
  t.mock.method(console, 'error', () => {});
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDsn = process.env.SENTRY_DSN;
  process.env.NODE_ENV = 'production';
  delete process.env.SENTRY_DSN; // keep Sentry.captureException from opening a socket
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDsn !== undefined) process.env.SENTRY_DSN = previousDsn;
  });

  const { sql, calls } = scriptedSql([delivery()], 1);

  const result = await broadcastNewsletter(sql, '2026-09-10', async () => {
    throw new Error('SMTP temporarily unavailable');
  });

  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
  assert.equal(releasedStatus(calls), 'pending');
});

// A subscriber whose address can never be delivered to used to hold its row
// 'pending' forever. The source item is only stamped once nothing of it is
// still pending, so the post stayed queued and re-sent itself to everyone who
// subscribed afterwards, and the row could never be aged out either.
test('a delivery that has exhausted its attempts is retired rather than retried forever', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { sql, calls } = scriptedSql([delivery({ attempts: 5 })], 0);

  const result = await broadcastNewsletter(sql, '2026-09-10', async () => {
    throw new Error('550 5.1.1 recipient does not exist');
  });

  assert.equal(result.failed, 1);
  assert.equal(result.abandoned, 1);
  assert.equal(releasedStatus(calls), 'failed');
});

test('a delivery below the attempt bound is still retried', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { sql, calls } = scriptedSql([delivery({ attempts: 4 })], 1);

  const result = await broadcastNewsletter(sql, '2026-09-10', async () => {
    throw new Error('SMTP temporarily unavailable');
  });

  assert.equal(result.abandoned, 0);
  assert.equal(releasedStatus(calls), 'pending');
});

// The body is no longer copied into one row per subscriber; it is read from the
// item at send time, with the stored column as the fallback for rows queued
// before that change.
test('the queued row carries no copy of the item body', async () => {
  const { sql, calls } = scriptedSql([delivery()]);

  await broadcastNewsletter(sql, '2026-09-10', async () => {});

  const insert = calls.find(({ statement }) =>
    statement.includes('INSERT INTO newsletter_deliveries'));
  assert.ok(insert, 'the run should queue due items');
  assert.match(insert.statement, /SELECT d\.item_type, d\.item_id, s\.id, d\.title, NULL::text/);

  const claim = calls.find(({ statement }) => statement.includes('WITH candidates AS'));
  assert.ok(claim, 'the run should claim a batch');
  for (const source of ['events ev', 'yearly_calendar_entries yc', 'blog_posts bp']) {
    assert.ok(
      claim.statement.includes(`LEFT JOIN ${source} ON`),
      `the claim should read the body from ${source} at send time`,
    );
  }
});

test('newsletter outbox skips a subscriber who is no longer active', async () => {
  const { sql, calls } = scriptedSql([
    delivery({ email: null, subscriberStatus: 'unsubscribed' }),
  ]);
  let sendCount = 0;

  const result = await broadcastNewsletter(sql, '2026-09-10', async () => {
    sendCount += 1;
  });

  assert.equal(sendCount, 0);
  assert.equal(result.skipped, 1);
  assert.equal(
    calls.some(({ statement }) => statement.includes("SET status = 'skipped'")),
    true,
  );
});

test('a flagged news post is broadcast with an excerpt and a link to the post', async () => {
  const { sql, calls } = scriptedSql([
    delivery({
      itemType: 'news',
      itemId: 42,
      title: 'Dugnaden er i havn',
      description: `<p>${'Takk for innsatsen. '.repeat(60)}</p>`,
    }),
  ]);
  const sentMessages = [];

  const result = await broadcastNewsletter(sql, '2026-09-10', async (message) => {
    sentMessages.push(message);
  });

  assert.equal(result.sent, 1);
  assert.match(sentMessages[0].subject, /^Nytt fra FAU: Dugnaden er i havn$/);
  assert.match(sentMessages[0].text, /\/nyheter\/42/);
  // The body is a teaser, not the whole article.
  assert.equal(sentMessages[0].text.includes('Takk for innsatsen. '.repeat(60).trim()), false);
  assert.match(sentMessages[0].text, /Takk for innsatsen\./);
  // Only stamp the post once no delivery for it is still in flight.
  assert.equal(
    calls.some(({ statement }) => statement.includes('UPDATE blog_posts p SET newsletter_sent_at')),
    true,
  );
});

test('news posts are queued by flag, independent of the run date', async () => {
  const { sql, calls } = scriptedSql([]);

  await broadcastNewsletter(sql, '2026-09-10', async () => {});

  const queueStatement = calls.find(({ statement }) =>
    statement.includes('INSERT INTO newsletter_deliveries'))?.statement;

  assert.match(queueStatement, /FROM blog_posts WHERE status = 'published' AND notify_newsletter = true AND newsletter_sent_at IS NULL/);
});

// The claim window used to be `event_date = targetDate` while the cron runs
// once a day, so a delivery that failed (or was left 'processing' by a crashed
// run) could never be claimed again: the next run looks at a different date.
// Retry was structurally dead for event and calendar items, and the stranded
// row also blocked its source item from ever being stamped.
test('the claim window reaches deliveries left over from an earlier date', async () => {
  const { sql, calls } = scriptedSql([delivery({ eventDate: '2026-09-08' })]);

  await broadcastNewsletter(sql, '2026-09-10', async () => {});

  const claim = calls.find(({ statement }) => statement.includes('WITH candidates AS'));
  assert.ok(claim, 'the run should issue a claim query');
  assert.match(
    claim.statement,
    /event_date <= \?/,
    'claim must use <= targetDate so an older pending row is still reachable',
  );
  assert.doesNotMatch(
    claim.statement,
    /WHERE event_date = \?/,
    'a single-date claim window strands every delivery that misses its own run',
  );
});

// Stamping keyed off the date had the same shape of bug: an item whose
// deliveries only finished on a later run was never stamped, so it stayed
// queued for rebroadcast every night.
test('source items are stamped from their deliveries, not from the run date', async () => {
  const { sql, calls } = scriptedSql([delivery()]);

  await broadcastNewsletter(sql, '2026-09-10', async () => {});

  for (const table of ['events', 'yearly_calendar_entries']) {
    const stamp = calls.find(
      ({ statement }) =>
        statement.includes(`UPDATE ${table}`) && statement.includes('newsletter_sent_at = NOW()'),
    );
    assert.ok(stamp, `${table} should be stamped`);
    assert.match(
      stamp.statement,
      /newsletter_sent_at IS NULL/,
      `${table} stamping must be keyed off delivery state, not the run date`,
    );
    assert.doesNotMatch(
      stamp.statement,
      /e\.date = \?/,
      `${table} stamping must not be scoped to a single run date`,
    );
  }
});

// A run killed at maxDuration leaves every claimed-but-unsent row stuck in
// 'processing'. The budget makes the run hand rows back itself instead.
test('a delivery is released rather than sent once the run budget is spent', async () => {
  const { sql, calls } = scriptedSql([delivery()], 1);
  let sendCount = 0;

  const expiredDeadline = Date.now() - 1;
  const result = await broadcastNewsletter(
    sql,
    '2026-09-10',
    async () => { sendCount += 1; },
    expiredDeadline,
  );

  assert.equal(sendCount, 0, 'no message should be sent after the deadline');
  assert.equal(result.deferred, 1);
  assert.equal(result.sent, 0);
  assert.equal(
    calls.some(({ statement }) =>
      statement.includes("SET status = 'pending', claimed_at = NULL") && !statement.includes('next_attempt_at')),
    true,
    'the row must be handed back as pending, not left claimed',
  );
});
