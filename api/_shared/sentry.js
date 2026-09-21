import crypto from 'crypto';
import { redactSensitiveText } from './redact.js';

// Vercel freezes the instance as soon as the response is written, so a capture
// that is still in flight at that moment is simply lost — which is why Sentry
// looked quiet while production was throwing. Callers now await the capture,
// and this bound stops a slow or unreachable ingest endpoint from holding the
// user's response open for more than a moment.
const SENTRY_TIMEOUT_MS = 1000;

function timeoutSignal(ms) {
  return typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

function getSentryEndpoint(dsn) {
  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\/+/, '').split('/').pop();
    if (!projectId) return null;
    return `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`;
  } catch {
    return null;
  }
}

function toSentryEvent(error) {
  const now = new Date().toISOString();
  return {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: now,
    platform: 'javascript',
    level: 'error',
    server_name: process.env.VERCEL_REGION || 'vercel-serverless',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    exception: {
      values: [
        {
          type: error?.name || 'Error',
          value: redactSensitiveText(error?.message || String(error)),
          stacktrace: error?.stack
            ? {
                frames: redactSensitiveText(error.stack)
                  .split('\n')
                  .slice(1, 30)
                  .map((line) => ({ function: line.trim() }))
                  .reverse(),
              }
            : undefined,
        },
      ],
    },
  };
}

async function sendSentryEvent(error) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || typeof fetch !== 'function') return;

  const endpoint = getSentryEndpoint(dsn);
  if (!endpoint) return;

  const sentAt = new Date().toISOString();
  const event = toSentryEvent(error);
  const envelope = [
    JSON.stringify({ dsn, sent_at: sentAt }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
      signal: timeoutSignal(SENTRY_TIMEOUT_MS),
    });
  } catch (sendError) {
    console.error('Sentry event delivery failed:', redactSensitiveText(sendError.message));
  }
}

const Sentry = {
  /**
   * Returns a promise that settles once the event has been delivered or the
   * timeout above has expired. It never rejects, so an `await` here can never
   * turn a handled 500 into an unhandled one.
   * @param {Error} error
   * @returns {Promise<void>}
   */
  captureException(error) {
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      return sendSentryEvent(error);
    }
    return Promise.resolve();
  },
};

export default Sentry;
