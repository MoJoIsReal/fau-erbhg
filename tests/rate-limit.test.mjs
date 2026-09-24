import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRateLimit, getClientIp, rateLimitKey } from '../api/_shared/rate-limit.js';

// Models what actually reaches a Vercel function: the platform sets x-real-ip
// itself and overwrites any incoming copy, while everything to the left of the
// last x-forwarded-for hop is whatever the caller chose to send.
function request(ip = '203.0.113.10', spoofedPrefix = null) {
  return {
    headers: {
      'x-real-ip': ip,
      'x-forwarded-for': spoofedPrefix ? `${spoofedPrefix}, ${ip}` : ip,
    },
  };
}

test('keys are hashed, case-insensitive on the identifier and scoped by IP', () => {
  const key = rateLimitKey(request(), 'login', 'Admin@Example.com');
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, rateLimitKey(request(), 'login', ' admin@example.com '));
  assert.notEqual(key, rateLimitKey(request('203.0.113.11'), 'login', 'admin@example.com'));
  assert.notEqual(key, rateLimitKey(request(), 'contact', 'admin@example.com'));
});

// Every per-IP limit on this API was bypassable by prepending a fresh entry to
// X-Forwarded-For. A caller-chosen left-most hop must not move the key.
test('a spoofed or rotated left-most X-Forwarded-For hop does not change the key', () => {
  const key = rateLimitKey(request(), 'login', 'admin@example.com');
  for (const spoof of ['198.51.100.7', '198.51.100.8']) {
    assert.equal(rateLimitKey(request('203.0.113.10', spoof), 'login', 'admin@example.com'), key);
  }
});

test('without x-real-ip the right-most hop, then the socket, is trusted', () => {
  assert.equal(getClientIp({ headers: { 'x-forwarded-for': '198.51.100.9, 203.0.113.10' } }), '203.0.113.10');
  assert.equal(getClientIp({ headers: {}, socket: { remoteAddress: '192.0.2.1' } }), '192.0.2.1');
  assert.equal(getClientIp({ headers: { 'x-real-ip': '  ' } }), 'unknown');
});

function stubSql(row) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values });
    return [row];
  };
  return { sql, calls };
}

test('a request within the limit is allowed; the next one over it is refused', async () => {
  const within = stubSql({ count: 5, retryAfter: 42 });
  assert.deepEqual(await checkRateLimit(within.sql, { key: 'k', limit: 5, windowSeconds: 60 }), {
    allowed: true,
    retryAfter: 42,
  });
  assert.deepEqual(within.calls[0].values, ['k', 60, 60]);
  assert.match(within.calls[0].text, /ON CONFLICT \(key\) DO UPDATE/);

  const over = stubSql({ count: 6, retryAfter: 42 });
  assert.equal((await checkRateLimit(over.sql, { key: 'k', limit: 5, windowSeconds: 60 })).allowed, false);
});

test('retryAfter never reports zero, so a Retry-After header is always meaningful', async () => {
  const expiring = stubSql({ count: 9, retryAfter: 0 });
  assert.equal((await checkRateLimit(expiring.sql, { key: 'k', limit: 1, windowSeconds: 60 })).retryAfter, 60);
  const negative = stubSql({ count: 9, retryAfter: -3 });
  assert.equal((await checkRateLimit(negative.sql, { key: 'k', limit: 1, windowSeconds: 60 })).retryAfter, 1);
});
