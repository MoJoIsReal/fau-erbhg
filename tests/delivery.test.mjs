import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deliveryMessageId,
  nextAttemptAt,
  runWithConcurrency,
} from '../api/_shared/delivery.js';

test('delivery message IDs are deterministic and scoped by delivery kind', () => {
  const first = deliveryMessageId('newsletter', 42);
  assert.equal(first, deliveryMessageId('newsletter', 42));
  assert.notEqual(first, deliveryMessageId('registration-reminder', 42));
  assert.match(first, /^<[a-f0-9]{64}@erdal-bhg\.no>$/);
});

test('delivery retry backoff grows exponentially and caps at one hour', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  assert.equal(nextAttemptAt(1, now), '2026-09-09T12:01:00.000Z');
  assert.equal(nextAttemptAt(4, now), '2026-09-09T12:08:00.000Z');
  assert.equal(nextAttemptAt(20, now), '2026-09-09T13:00:00.000Z');
});

test('bounded worker never exceeds configured concurrency and processes every item', async () => {
  let active = 0;
  let maximumActive = 0;
  const completed = [];

  await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    completed.push(item);
    active -= 1;
  });

  assert.equal(maximumActive, 3);
  assert.deepEqual(completed.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test('bounded worker rejects invalid concurrency', async () => {
  await assert.rejects(
    runWithConcurrency([1], 0, async () => {}),
    /positive integer/,
  );
});
