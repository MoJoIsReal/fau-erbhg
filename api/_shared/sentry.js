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

// Tags that tie an event to the request (its id is the one the user saw and
// the one in the log line) and the route. Kept only when the value looks like
// an id or a path, the same rule log.js uses, so nothing a caller typed into
// `?action=` becomes a searchable tag.
const TAG_KEYS = ['requestId', 'method', 'path', 'action', 'resource', 'role', 'targetId'];
const TAG_SHAPE = /^[A-Za-z0-9:._/-]{1,200}$/;

function sentryTags(context = {}) {
  const tags = {};
  for (const key of TAG_KEYS) {
    const value = context[key] == null ? '' : String(context[key]);
    if (TAG_SHAPE.test(value)) tags[key] = value;
  }
  return tags;
}

export function toSentryEvent(error, context) {
  const now = new Date().toISOString();
  return {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: now,
    platform: 'javascript',
    level: 'error',
    server_name: process.env.VERCEL_REGION || 'vercel-serverless',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    // The deploy, so an event can be tied to the commit that shipped it.
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    tags: sentryTags(context),
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

async function sendSentryEvent(error, context) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || typeof fetch !== 'function') return;

  const endpoint = getSentryEndpoint(dsn);
  if (!endpoint) return;

  const sentAt = new Date().toISOString();
  const event = toSentryEvent(error, context);
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
   * @param {Object} [context] - requestFields(req), sent as tags
   * @returns {Promise<void>}
   */
  captureException(error, context) {
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      return sendSentryEvent(error, context);
    }
    return Promise.resolve();
  },
};

export default Sentry;
