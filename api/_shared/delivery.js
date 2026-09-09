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

export async function runWithConcurrency(items, concurrency, worker) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Concurrency must be a positive integer');
  }

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    },
  );
  await Promise.all(workers);
}
