// Turnstile's server check refuses a missing or bad token, and lets a request
// through when the fault is Cloudflare's or our configuration's — never the
// visitor's. Cloudflare is stubbed at the network boundary (global fetch).
import assert from 'node:assert/strict';
import test from 'node:test';
import { SITEVERIFY_URL, TURNSTILE_FAILED, turnstileFailure, verifyTurnstile } from '../api/_shared/turnstile.js';

const REQUEST = { headers: { 'x-real-ip': '203.0.113.7' } };
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

// Enables the check for one test and answers siteverify with `reply`: a JSON
// body (HTTP 200), `{ status, json }` or `{ status, text }`, an HTTP status
// with a non-JSON body, or an Error to throw. Live siteverify answers token errors with 200 and secret
// errors or `bad-request` with 400, each with the same JSON shape.
function cloudflare(t, reply, secret = 'test-secret') {
  process.env.TURNSTILE_SECRET_KEY = secret;
  t.after(() => { delete process.env.TURNSTILE_SECRET_KEY; });
  for (const level of ['log', 'warn', 'error']) t.mock.method(console, level, () => {});
  return t.mock.method(globalThis, 'fetch', async () => {
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'number') return new Response('upstream failure', { status: reply });
    if (reply.text !== undefined) return new Response(reply.text, { status: reply.status });
    if (reply.status) return Response.json(reply.json, { status: reply.status });
    return Response.json(reply);
  });
}

test('without a secret the check is off and Cloudflare is never asked', async (t) => {
  delete process.env.TURNSTILE_SECRET_KEY;
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not be called'); });
  assert.equal(await verifyTurnstile(REQUEST, undefined, 'contact'), true);
  assert.equal(fetch.mock.callCount(), 0);
});

test('a missing, non-string or oversized token is refused without a network call', async (t) => {
  const fetch = cloudflare(t, { success: true });
  for (const token of [undefined, '', 42, { token: TOKEN }, 'x'.repeat(2049)]) {
    assert.equal(await verifyTurnstile(REQUEST, token, 'contact'), false, JSON.stringify(token)?.slice(0, 20));
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('a valid token passes, and siteverify gets the secret, the token and the visitor IP', async (t) => {
  const fetch = cloudflare(t, { success: true, 'error-codes': [] });
  assert.equal(await verifyTurnstile(REQUEST, TOKEN, 'registration'), true);
  const [url, init] = fetch.mock.calls[0].arguments;
  assert.equal(url, SITEVERIFY_URL);
  assert.equal(init.method, 'POST');
  assert.deepEqual(JSON.parse(init.body), { secret: 'test-secret', response: TOKEN, remoteip: '203.0.113.7' });
  assert.ok(init.signal, 'the call is bounded by a timeout');
});

test('Cloudflare saying the token is invalid, expired or reused is a refusal', async (t) => {
  for (const codes of [['invalid-input-response'], ['timeout-or-duplicate'], ['missing-input-response'], []]) {
    await t.test(codes.join(',') || 'no code', async (t) => {
      cloudflare(t, { success: false, 'error-codes': codes });
      assert.equal(await verifyTurnstile(REQUEST, TOKEN, 'newsletter'), false);
    });
  }
});

// Failing open on any 4xx would let a caller who can provoke one — a
// malformed request, Cloudflare rate-limiting our calls — skip the check.
test('a 4xx that is not about our secret is a refusal, not an outage', async (t) => {
  for (const [name, reply] of [
    ['bad-request', { status: 400, json: { success: false, 'error-codes': ['bad-request'] } }],
    ['rate limited', 429],
    ['forbidden without a body', 403],
  ]) {
    await t.test(name, async (t) => {
      cloudflare(t, reply);
      assert.equal(await verifyTurnstile(REQUEST, TOKEN, 'contact'), false);
    });
  }
});

test('Cloudflare being down or rejecting our own secret lets the request through', async (t) => {
  for (const [name, reply] of [
    ['network error', new Error('ECONNRESET')],
    ['HTTP 503', 503],
    ['HTTP 200 with an unreadable body', { status: 200, text: '<html>gateway hiccup' }],
    ['internal error', { success: false, 'error-codes': ['internal-error'] }],
    ['wrong secret, as live siteverify answers it', { status: 400, json: { success: false, 'error-codes': ['invalid-input-secret'] } }],
    ['missing secret', { status: 400, json: { success: false, 'error-codes': ['missing-input-secret'] } }],
  ]) {
    await t.test(name, async (t) => {
      cloudflare(t, reply);
      assert.equal(await verifyTurnstile(REQUEST, TOKEN, 'contact'), true);
      assert.ok(console.error.mock.callCount() > 0, 'the fault is reported');
    });
  }
});

test('the refusal body carries a stable code and a message in the form language', () => {
  assert.equal(turnstileFailure('no').code, TURNSTILE_FAILED);
  assert.match(turnstileFailure('no').error, /Sikkerhetssjekken/);
  assert.match(turnstileFailure('en').error, /security check/);
});
