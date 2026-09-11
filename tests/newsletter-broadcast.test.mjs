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
  assert.equal(
    calls.some(({ statement }) => statement.includes("SET status = 'pending', claimed_at = NULL")),
    true,
  );
  assert.equal(
    calls.some(({ statement }) => statement.includes("SET status = 'sent', sent_at = NOW()")),
    false,
  );
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
