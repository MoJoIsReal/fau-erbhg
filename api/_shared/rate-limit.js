import crypto from 'crypto';

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
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

export async function clearRateLimit(sql, key) {
  await sql`DELETE FROM api_rate_limits WHERE key = ${key}`;
}
