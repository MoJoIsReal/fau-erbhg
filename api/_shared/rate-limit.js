import crypto from 'crypto';
import { logEvent } from './log.js';

// The left-most X-Forwarded-For entry is whatever the client sent. Taking it
// made every per-IP limit here bypassable by rotating one request header, which
// is the whole protection on login, contact and registration. Vercel's proxy
// sets `x-real-ip` itself and overwrites any incoming copy, so that is the
// trustworthy value; the right-most X-Forwarded-For hop is the one our own
// proxy appended and is the correct fallback. Client-supplied entries to the
// left of it are ignored either way.
export function getClientIp(req) {
  const realIp = req.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim().length > 0) {
    return realIp.trim();
  }

  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    const hops = forwardedFor.split(',').map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }

  return req.socket?.remoteAddress || 'unknown';
}

function hashKey(parts) {
  return crypto
    .createHash('sha256')
    .update(parts.filter(Boolean).join(':'))
    .digest('hex');
}

export function rateLimitKey(req, scope, identifier = '') {
  return hashKey([scope, getClientIp(req), String(identifier).trim().toLowerCase()]);
}

// For limits keyed on an identity alone (one account, one browser) rather
// than on the caller's IP. Hashed like every other key, so no address is
// stored in api_rate_limits.
export function identityRateLimitKey(scope, identifier) {
  return hashKey([scope, String(identifier).trim().toLowerCase()]);
}

export async function checkRateLimit(sql, { key, limit, windowSeconds }) {
  const rows = await sql`
    INSERT INTO api_rate_limits (key, count, reset_at, updated_at)
    VALUES (${key}, 1, NOW() + (${windowSeconds} * INTERVAL '1 second'), NOW())
    ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN api_rate_limits.reset_at <= NOW() THEN 1
        ELSE api_rate_limits.count + 1
      END,
      reset_at = CASE
        WHEN api_rate_limits.reset_at <= NOW() THEN NOW() + (${windowSeconds} * INTERVAL '1 second')
        ELSE api_rate_limits.reset_at
      END,
      updated_at = NOW()
    RETURNING count, EXTRACT(EPOCH FROM (reset_at - NOW()))::int AS "retryAfter"
  `;

  const row = rows[0];
  return {
    allowed: row.count <= limit,
    retryAfter: Math.max(row.retryAfter || windowSeconds, 1),
  };
}

// Read a counter without adding to it. checkRateLimit counts the request it
// is asked about; a limit that should count only failures has to look first
// and record the failure afterwards. Same boundary: `limit` counted events are
// allowed, the next is refused.
export async function peekRateLimit(sql, { key, limit }) {
  const rows = await sql`
    SELECT count, EXTRACT(EPOCH FROM (reset_at - NOW()))::int AS "retryAfter"
    FROM api_rate_limits
    WHERE key = ${key} AND reset_at > NOW()
  `;
  const row = rows[0];
  if (!row) return { allowed: true, retryAfter: 0 };
  return {
    allowed: row.count < limit,
    retryAfter: Math.max(row.retryAfter || 1, 1),
  };
}

export async function clearRateLimit(sql, key) {
  await sql`DELETE FROM api_rate_limits WHERE key = ${key}`;
}

// Every mail an anonymous request can make us send — signup confirmations,
// contact receipts and notifications, newsletter confirmations — goes out from
// the one Gmail account, whose daily sending quota (500 on a consumer account)
// the morning reminders and the evening newsletter also need. Per-IP limits do
// not bound the total: a caller rotating addresses could spend the quota, or
// get the account throttled for spam, and legitimate mail would stop. This caps
// the total across all callers per day and leaves the rest for scheduled mail.
// A refused mail is logged, never an error: the request itself has already
// succeeded and its data is stored.
export const PUBLIC_MAIL_DAILY_LIMIT = 200;
const PUBLIC_MAIL_WINDOW_SECONDS = 24 * 60 * 60;

export async function sendPublicMail(sql, kind, send) {
  const { allowed } = await checkRateLimit(sql, {
    key: hashKey(['public-mail']),
    limit: PUBLIC_MAIL_DAILY_LIMIT,
    windowSeconds: PUBLIC_MAIL_WINDOW_SECONDS,
  });
  if (!allowed) {
    logEvent('warn', 'mail.public_daily_cap_reached', { kind, limit: PUBLIC_MAIL_DAILY_LIMIT });
    return false;
  }
  await send();
  return true;
}
