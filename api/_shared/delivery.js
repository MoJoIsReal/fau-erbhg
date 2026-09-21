import crypto from 'crypto';

export const DELIVERY_CONCURRENCY = 5;
export const DELIVERY_LEASE_MINUTES = 10;

export function deliveryMessageId(kind, id) {
  const digest = crypto.createHash('sha256').update(`${kind}:${id}`).digest('hex');
  return `<${digest}@erdal-bhg.no>`;
}

export function nextAttemptAt(attempts, now = new Date()) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, Number(attempts) - 1));
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

// Errors are collected rather than rethrown from the worker. `Promise.all`
// rejects on the first failure, but the other workers keep pulling from the
// queue behind it: the caller sees the batch as finished while several
// `UPDATE`s are still in flight, and on Vercel the instance freezes as soon as
// the response is written, cutting those writes off mid-statement. Every
// worker now runs to the end of the queue and the failures surface together.
export async function runWithConcurrency(items, concurrency, worker) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Concurrency must be a positive integer');
  }

  let cursor = 0;
  const errors = [];
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        try {
          await worker(item);
        } catch (error) {
          errors.push(error);
        }
      }
    },
  );
  await Promise.all(workers);

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `${errors.length} of ${items.length} items failed`,
    );
  }
}
