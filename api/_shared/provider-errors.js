import { waitUntil } from '@vercel/functions';
import Sentry from './sentry.js';
import { redactSensitiveText } from './redact.js';

export function safeProviderError(error) {
  const message = redactSensitiveText(error?.message || String(error || 'Unknown provider error'));
  return {
    name: error?.name || 'Error',
    message: message.substring(0, 500),
    code: typeof error?.code === 'string'
      ? redactSensitiveText(error.code).substring(0, 100)
      : undefined,
  };
}

export function reportProviderError(context, error) {
  const safe = safeProviderError(error);
  console.error(`${context}:`, safe);
  if (process.env.NODE_ENV === 'production') {
    const captured = new Error(`${context}: ${safe.message}`);
    captured.name = safe.name;
    if (safe.code) captured.code = safe.code;
    // captureException is awaitable now, but these are reported from inside
    // callbacks that must not hold the response open. waitUntil keeps the
    // instance alive until the capture finishes; outside a Vercel request
    // context it is a no-op, which is the old fire-and-forget behaviour.
    waitUntil(Sentry.captureException(captured));
  }
  return safe;
}
