import crypto from 'crypto';

function redactSensitiveText(value) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, '[redacted-phone]');
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
    });
  } catch (sendError) {
    console.error('Sentry event delivery failed:', redactSensitiveText(sendError.message));
  }
}

const Sentry = {
  captureException(error) {
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      void sendSentryEvent(error);
    }
  },
};

export default Sentry;
