/**
 * Cloudflare Turnstile: the server half of the check that a public form was
 * sent by a person. The widget in the browser (client/src/components/
 * turnstile-widget.tsx) gives the form a single-use token; this asks
 * Cloudflare whether that token is genuine.
 *
 * Off until TURNSTILE_SECRET_KEY is set, so the code can ship before the keys
 * exist. Once it is set, every signup, contact message and newsletter signup
 * must carry a token.
 *
 * Failure policy:
 * - no token, or Cloudflare says the token is invalid, expired or already
 *   used: refuse (the caller answers 400 with code TURNSTILE_FAILED);
 * - Cloudflare unreachable, timing out or answering 5xx, or rejecting our own
 *   secret: let the request through and report it. Those are Cloudflare's or
 *   our faults, not the parent's; the per-IP limits and the daily public-mail
 *   cap still apply in the meantime;
 * - any other refusal, including a 4xx that is not about our secret (a
 *   malformed request, a rate limit): refuse. Letting those through would let
 *   a caller who can provoke one skip the check.
 *
 * Checked against the live API with Cloudflare's test keys: token errors come
 * back as HTTP 200 with `success: false`; secret errors and `bad-request` as
 * HTTP 400 with the same JSON shape.
 */
import { getClientIp } from './rate-limit.js';
import { logEvent } from './log.js';
import { reportProviderError } from './provider-errors.js';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_FAILED = 'TURNSTILE_FAILED';

const VERIFY_TIMEOUT_MS = 5000;
// Cloudflare's documented maximum token length.
const MAX_TOKEN_LENGTH = 2048;
// The codes that are our fault or Cloudflare's, never the visitor's. Every
// other outcome that is not a success is a refusal.
const NOT_THE_VISITORS_FAULT = new Set([
  'missing-input-secret',
  'invalid-input-secret',
  'internal-error',
]);

export function isTurnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

// The 400 body a handler sends when verifyTurnstile refuses. The client keys
// its (translated) message off `code`; `error` is the fallback text.
export function turnstileFailure(language) {
  return {
    code: TURNSTILE_FAILED,
    error: language === 'en'
      ? 'The security check expired or failed. Please try again.'
      : 'Sikkerhetssjekken utløp eller feilet. Prøv igjen.',
  };
}

/**
 * Whether the request may proceed. `kind` names the form in logs.
 * @param {Object} req
 * @param {unknown} token - the widget's token, as sent by the form
 * @param {string} kind
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstile(req, token, kind) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;

  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    logEvent('warn', 'turnstile.rejected', { kind, reason: 'missing-token' });
    return false;
  }

  const ip = getClientIp(req);
  let response;
  let result = null;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        ...(ip && ip !== 'unknown' ? { remoteip: ip } : {}),
      }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    result = await response.json().catch(() => null);
  } catch (error) {
    reportProviderError(`Turnstile unavailable (${kind}); request allowed`, error);
    return true;
  }

  // A 5xx, or a 200 whose body never arrived intact, is Cloudflare's trouble.
  if (response.status >= 500 || (response.ok && result === null)) {
    reportProviderError(
      `Turnstile unavailable (${kind}); request allowed`,
      Object.assign(new Error(`siteverify answered ${response.status}`), { code: `HTTP_${response.status}` }),
    );
    return true;
  }

  if (response.ok && result?.success === true) return true;

  const codes = Array.isArray(result?.['error-codes']) ? result['error-codes'].map(String) : [];
  if (codes.length > 0 && codes.every((code) => NOT_THE_VISITORS_FAULT.has(code))) {
    // Fix TURNSTILE_SECRET_KEY (or wait out Cloudflare); don't punish parents.
    reportProviderError(
      `Turnstile rejected the server configuration (${kind}); request allowed`,
      Object.assign(new Error(codes.join(', ')), { code: codes[0] }),
    );
    return true;
  }

  logEvent('warn', 'turnstile.rejected', {
    kind,
    status: response.status,
    reason: codes.join(',') || 'unsuccessful',
  });
  return false;
}
