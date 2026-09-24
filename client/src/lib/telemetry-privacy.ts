import type { makeFetchTransport } from '@sentry/react';

type Transport = ReturnType<typeof makeFetchTransport>;

const CAPABILITY_KEY = /^(?:token|bekreft|avmeld)$/i;
const JSON_ITEM_TYPES = new Set(['event', 'transaction', 'span', 'session', 'sessions', 'client_report', 'log', 'metric', 'trace_metric']);

function scrubText(value: string): string {
  return value
    // Include encoded URLs and short/invalid tokens, not only valid capabilities.
    .replace(/((?:[?&]|%3f|%26)(?:token|bekreft|avmeld)(?:=|%3d))[^&#\s"'<>]*/gi, '$1[Filtered]')
    // Both capability families use 32 random bytes encoded as 64 hex digits.
    // Scrub standalone copies in exception messages and serialized request bodies.
    .replace(/\b[a-f0-9]{64}\b/gi, '[Filtered]');
}

export function scrubTelemetry<T>(value: T): T {
  if (typeof value === 'string') return scrubText(value) as T;
  if (Array.isArray(value)) return value.map(item => scrubTelemetry(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, CAPABILITY_KEY.test(key) ? '[Filtered]' : scrubTelemetry(item),
    ])) as T;
  }
  return value;
}

// Enforce privacy at the final SDK boundary, after request context, breadcrumbs
// and tracing integrations have enriched events. Compressed replay/attachments
// cannot be safely scrubbed as JSON, so they must never pass this transport.
export function privateTelemetryTransport(transport: Transport): Transport {
  return {
    flush: timeout => transport.flush(timeout),
    send(envelope) {
      if (envelope[1].some(([header, payload]) =>
        !JSON_ITEM_TYPES.has(header.type) || payload instanceof Uint8Array,
      )) return Promise.resolve({});
      return transport.send(scrubTelemetry(envelope));
    },
  };
}
