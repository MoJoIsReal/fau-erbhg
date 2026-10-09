import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkRateLimit, clientNetwork, getClientIp, identityRateLimitKey, rateLimitDigest, rateLimitKey, releaseRateLimit, reservePublicMail,
} from '../api/_shared/rate-limit.js';

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
    count: 5,
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

// A limit that counts only failures reserves each attempt with
// checkRateLimit before the slow check and hands it back when it was not a
// failure. The hand-back never goes below zero and only touches a live window,
// so an attempt is never credited to the next one.
test('releasing hands one attempt back within the live window only', async () => {
  const release = stubSql({});
  await releaseRateLimit(release.sql, 'k');
  assert.equal(release.calls.length, 1);
  assert.match(release.calls[0].text, /^\s*UPDATE api_rate_limits/);
  assert.match(release.calls[0].text, /GREATEST\(count - 1, 0\)/);
  assert.match(release.calls[0].text, /reset_at > NOW\(\)/);
  assert.deepEqual(release.calls[0].values, ['k']);
});

test('identity keys are hashed and case-insensitive, and never carry the address', () => {
  const key = identityRateLimitKey('login-account', ' Member@Example.TEST ');
  assert.equal(key, identityRateLimitKey('login-account', 'member@example.test'));
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(key, identityRateLimitKey('login-device', 'member@example.test'));
});

// Every public form shares one Gmail account. A burst of contact or newsletter
// mail may use part of the day, never all of it: the signup confirmation
// carries the only link a parent has to their signup.
test('public mail: other kinds share a pool, so confirmations are never starved', async (t) => {
  t.mock.method(console, 'error', () => {});
  const counts = new Map();
  const sql = async (strings, ...values) => {
    const key = values[0];
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return [{ count: counts.get(key), retryAfter: 60 }];
  };

  let acknowledgements = 0;
  while (await reservePublicMail(sql, 'contact-acknowledgement')) acknowledgements += 1;
  assert.equal(acknowledgements, 40, 'the receipt to an unverified sender has the smallest share');

  let others = 0;
  while (await reservePublicMail(sql, 'contact-notification')) others += 1;
  assert.equal(acknowledgements + others, 100, 'all non-confirmation mail shares one pool');

  let confirmations = 0;
  while (await reservePublicMail(sql, 'registration-confirmation')) confirmations += 1;
  assert.equal(confirmations, 100, 'whatever the others used, confirmations keep the rest of the day');
  assert.equal(counts.get(rateLimitDigest(['public-mail'])) - 1, 200, 'and the day never goes past the total');
});

// A plain SHA-256 of an IP or an e-mail address can be reversed from a copy of
// api_rate_limits: IPv4 has 2^32 values and the families' addresses are a
// short list. The keys are an HMAC under a key derived from SESSION_SECRET.
test('keys are keyed: a plain hash of the same input does not match', async () => {
  const { createHash } = await import('node:crypto');
  const key = identityRateLimitKey('login-account', 'member@example.test');
  assert.notEqual(key, createHash('sha256').update('login-account:member@example.test').digest('hex'));
  assert.equal(key, identityRateLimitKey('login-account', 'member@example.test'), 'stable for one secret');
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'another-secret-that-is-long-enough-1234567890';
  try {
    assert.notEqual(identityRateLimitKey('login-account', 'member@example.test'), key, 'and changes with it');
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});

// One IPv6 client usually holds a whole /64; keyed on the full address, every
// per-IP limit was 2^64 limits.
test('IPv6 callers are limited per /64 network, IPv4-mapped ones as IPv4', () => {
  assert.equal(clientNetwork('2001:db8:abcd:12:1::5'), '2001:db8:abcd:12::/64');
  assert.equal(clientNetwork('2001:db8:abcd:12:ffff::1'), clientNetwork('2001:db8:abcd:12:1::5'));
  assert.notEqual(clientNetwork('2001:db8:abcd:13::1'), clientNetwork('2001:db8:abcd:12::1'));
  assert.equal(clientNetwork('::ffff:203.0.113.5'), '203.0.113.5');
  assert.equal(clientNetwork('203.0.113.5'), '203.0.113.5');
  assert.equal(rateLimitKey(request('2001:db8:abcd:12:1::5'), 'login', 'x'), rateLimitKey(request('2001:db8:abcd:12:9::9'), 'login', 'x'));
  assert.equal(clientNetwork('not::an::address'), 'not::an::address', 'anything unparsable is kept as it is');
});
