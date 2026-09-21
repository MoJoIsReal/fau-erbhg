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

// MAINT-008. Promise.all rejected on the first throw while the other workers
// kept pulling from the queue behind it: the caller believed the batch was over
// and wrote its response, and on Vercel the instance freezes at that point —
// cutting off the UPDATEs those workers were still running.
test('a throwing worker does not abandon the rest of the batch mid-write', async () => {
  const started = [];
  const finished = [];

  await assert.rejects(
    runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (item === 1) throw new Error(`item ${item} failed`);
      finished.push(item);
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 1);
      assert.match(error.errors[0].message, /item 1 failed/);
      return true;
    },
  );

  assert.deepEqual(started.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(finished.sort((a, b) => a - b), [2, 3, 4, 5, 6]);
});

test('every failure in a batch is reported, not just the first', async () => {
  await assert.rejects(
    runWithConcurrency([1, 2, 3], 3, async (item) => {
      throw new Error(`item ${item} failed`);
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 3);
      assert.match(error.message, /3 of 3 items failed/);
      return true;
    },
  );
});

test('a batch where every worker succeeds still resolves', async () => {
  const done = [];
  await runWithConcurrency([1, 2, 3], 2, async (item) => { done.push(item); });
  assert.equal(done.length, 3);
});
