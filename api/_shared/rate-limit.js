import crypto from 'crypto';
import { getJwtConfig } from './jwt-config.js';
import { logEvent } from './log.js';
import { reportProviderError } from './provider-errors.js';

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

// Keys are an HMAC, not a plain hash: IPv4 has 2^32 values and the parents'
// and council's e-mail addresses are a small known set, so a plain SHA-256 of
// either could be reversed from a copy of api_rate_limits. The key is derived
// from SESSION_SECRET (as media-share.js derives its own); without a usable
// secret, as in a misconfigured preview, it falls back to an empty key rather
// than refusing every public form.
let digestKey = null;
let digestKeyFor = null;
function rateLimitSecretKey() {
  let secret = '';
  try {
    ({ secret } = getJwtConfig());
  } catch {
    // Login refuses the same misconfiguration loudly; see jwt-config.js.
  }
  if (digestKeyFor !== secret) {
    digestKey = Buffer.from(crypto.hkdfSync('sha256', secret, 'fau-rate-limit', 'rate-limit-v1', 32));
    digestKeyFor = secret;
  }
  return digestKey;
}

/** The stored key for a rate-limit or mail-budget counter. */
export function rateLimitDigest(parts) {
  return crypto
    .createHmac('sha256', rateLimitSecretKey())
    .update(parts.filter(Boolean).join(':'))
    .digest('hex');
}
const hashKey = rateLimitDigest;

// An IPv6 client usually has a whole /64 to itself, so keying on the full
// address handed one caller 2^64 separate buckets for every per-IP limit.
// IPv6 is keyed on its /64 network; an IPv4-mapped address on its IPv4 form.
export function clientNetwork(ip) {
  const address = String(ip).split('%')[0].trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1];
  if (!address.includes(':')) return address;
  const halves = address.split('::');
  if (halves.length > 2) return address;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return address;
  return `${groups.slice(0, 4).map((group) => parseInt(group, 16).toString(16)).join(':')}::/64`;
}

export function rateLimitKey(req, scope, identifier = '') {
  return hashKey([scope, clientNetwork(getClientIp(req)), String(identifier).trim().toLowerCase()]);
}

// For limits keyed on an identity alone (one account, one browser) rather
// than on the caller's IP. Keyed like every other, so no address is stored in
// api_rate_limits, nor anything a list of addresses could be matched against.
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
    count: row.count,
    retryAfter: Math.max(row.retryAfter || windowSeconds, 1),
  };
}

// Give back an attempt counted by checkRateLimit. A limit that should count
// only failures still has to count every attempt *before* the slow check:
// looking first and recording the failure afterwards lets a burst of
// concurrent requests all read the same count and all get through. So the
// attempt is reserved up front and handed back here when it turns out not to
// be a failure. Only a live window is touched, so an attempt never outlives
// the window it was counted in.
export async function releaseRateLimit(sql, key) {
  await sql`
    UPDATE api_rate_limits
    SET count = GREATEST(count - 1, 0), updated_at = NOW()
    WHERE key = ${key} AND reset_at > NOW()
  `;
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
//
// Within that total, a signup confirmation comes first: it carries the only
// link a parent has to their signup. Every other kind shares a smaller pool,
// so a burst of contact or newsletter submissions can use at most part of
// the day and never starve confirmations; the receipt to whoever filled in
// the contact form, the mail that matters least, has the smallest share.
//
// A refused mail is logged, never an error for the request: its data is
// already stored. The first refusal of the day is also reported, so someone
// hears about it before parents start asking where their mail went.
export const PUBLIC_MAIL_DAILY_LIMIT = 200;
const PUBLIC_MAIL_WINDOW_SECONDS = 24 * 60 * 60;
const PRIORITY_MAIL_KINDS = new Set(['registration-confirmation']);
export const PUBLIC_MAIL_OTHER_DAILY_LIMIT = 100;
const PUBLIC_MAIL_KIND_LIMITS = { 'contact-acknowledgement': 40 };

async function takeMailBudget(sql, key, limit) {
  const result = await checkRateLimit(sql, { key, limit, windowSeconds: PUBLIC_MAIL_WINDOW_SECONDS });
  return { allowed: result.allowed, first: result.count === limit + 1 };
}

/**
 * Count one public mail of `kind` against the daily budgets. Returns whether
 * it may be sent. Separate from sending so a handler can know before it
 * answers whether the mail will go out.
 * @param {Function} sql
 * @param {string} kind
 * @returns {Promise<boolean>}
 */
export async function reservePublicMail(sql, kind) {
  const budgets = [];
  if (!PRIORITY_MAIL_KINDS.has(kind)) {
    if (PUBLIC_MAIL_KIND_LIMITS[kind]) {
      budgets.push([hashKey(['public-mail', kind]), PUBLIC_MAIL_KIND_LIMITS[kind]]);
    }
    budgets.push([hashKey(['public-mail-other']), PUBLIC_MAIL_OTHER_DAILY_LIMIT]);
  }
  budgets.push([hashKey(['public-mail']), PUBLIC_MAIL_DAILY_LIMIT]);

  // Narrowest first: a mail its own share refuses never counts against the
  // total that confirmations depend on.
  for (const [key, limit] of budgets) {
    const { allowed, first } = await takeMailBudget(sql, key, limit);
    if (!allowed) {
      logEvent(first ? 'error' : 'warn', 'mail.public_daily_cap_reached', { kind, limit });
      if (first) reportProviderError('Public mail daily cap reached', new Error(`${kind} refused at ${limit} a day`));
      return false;
    }
  }
  return true;
}

export async function sendPublicMail(sql, kind, send) {
  if (!(await reservePublicMail(sql, kind))) return false;
  await send();
  return true;
}
