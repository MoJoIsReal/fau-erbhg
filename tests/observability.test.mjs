import assert from 'node:assert/strict';
import test from 'node:test';
import Sentry from '../api/_shared/sentry.js';
import {
  getRequestId,
  getRequestPath,
  logEvent,
  requestFields,
  setRequestActor,
} from '../api/_shared/log.js';
import { handleError, parseCookies, withApiHandler } from '../api/_shared/middleware.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    getHeader(key) { return this.headers[key.toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
  return res;
}

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    url: '/api/events',
    headers: { 'x-vercel-id': 'arn1:iad1:abc123' },
    query: {},
    ...overrides,
  };
}

// Captures the JSON lines the logger writes, so a test can assert on the fields
// rather than on a substring of a console message.
function captureLines(t) {
  const lines = [];
  const collect = (...args) => {
    for (const arg of args) {
      if (typeof arg !== 'string') continue;
      try { lines.push(JSON.parse(arg)); } catch { /* not one of ours */ }
    }
  };
  t.mock.method(console, 'log', collect);
  t.mock.method(console, 'error', collect);
  return lines;
}

test('a log line carries the request id, route and multiplexed resource', (t) => {
  const lines = captureLines(t);
  const req = mockReq({
    method: 'PUT',
    url: '/api/secure-settings?resource=blog-posts&id=12',
    query: { resource: 'blog-posts' },
  });
  setRequestActor(req, { userId: 4, role: 'admin' });

  logEvent('error', 'api.error', { ...requestFields(req), status: 500 });

  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], {
    level: 'error',
    event: 'api.error',
    requestId: 'arn1:iad1:abc123',
    method: 'PUT',
    path: '/api/secure-settings',
    resource: 'blog-posts',
    userId: 4,
    role: 'admin',
    status: 500,
  });
});

// Four handlers multiplex many resources behind one serverless function, so a
// line that does not name the resource cannot be acted on.
test('the two multiplexed routing parameters are both logged', (t) => {
  captureLines(t);
  const fields = requestFields(mockReq({
    url: '/api/auth?action=login',
    query: { action: 'login' },
  }));

  assert.equal(fields.action, 'login');
  assert.equal(fields.path, '/api/auth');
});

test('the query string never reaches a log line', (t) => {
  const lines = captureLines(t);
  const req = mockReq({
    url: '/api/contact?action=newsletter-unsubscribe&token=deadbeef&email=parent@example.test',
    query: { action: 'newsletter-unsubscribe' },
  });

  logEvent('warn', 'api.request_failed', { ...requestFields(req), status: 400 });

  const line = JSON.stringify(lines[0]);
  assert.equal(lines[0].path, '/api/contact');
  assert.ok(!line.includes('deadbeef'), 'a token must not be logged');
  assert.ok(!line.includes('parent@example.test'), 'an address must not be logged');
});

test('free-text fields are redacted and length-capped', (t) => {
  const lines = captureLines(t);

  logEvent('error', 'api.error', {
    message: 'could not reach parent@example.test on +47 12 34 56 78',
    resource: 'x'.repeat(500),
  });

  assert.match(lines[0].message, /\[redacted-email\]/);
  assert.match(lines[0].message, /\[redacted-phone\]/);
  assert.ok(!lines[0].message.includes('parent@example.test'));
  assert.equal(lines[0].resource.length, 200);
});

test('an unauthenticated request logs without an actor rather than failing', (t) => {
  captureLines(t);
  const fields = requestFields(mockReq());

  assert.equal(fields.userId, undefined);
  assert.equal(fields.role, undefined);
  assert.equal(fields.requestId, 'arn1:iad1:abc123');
});

test('a request with no platform id logs a null id rather than inventing one', (t) => {
  captureLines(t);
  assert.equal(getRequestId({ headers: {} }), null);
  assert.equal(getRequestId({}), null);
  assert.equal(getRequestPath({ url: '/api/events' }), '/api/events');
  assert.equal(getRequestPath({}), null);
});

test('the request id is echoed so a user can quote it', async (t) => {
  captureLines(t);
  const req = mockReq();
  const res = mockRes();

  await withApiHandler(async (_req, response) => response.status(200).json({ ok: true }))(req, res);

  assert.equal(res.getHeader('X-Request-Id'), 'arn1:iad1:abc123');
});

test('every non-2xx response produces exactly one attributable line', async (t) => {
  const lines = captureLines(t);
  const req = mockReq({
    method: 'DELETE',
    url: '/api/secure-settings?resource=users&id=3',
    query: { resource: 'users' },
  });
  setRequestActor(req, { userId: 9, role: 'admin' });

  await withApiHandler(async (_req, res) => res.status(404).json({ error: 'Not found' }))(req, mockRes());

  const failures = lines.filter((line) => line.event === 'api.request_failed');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].level, 'warn', 'a 4xx is the handler working as designed');
  assert.equal(failures[0].status, 404);
  assert.equal(failures[0].resource, 'users');
  assert.equal(failures[0].userId, 9);
  assert.equal(typeof failures[0].durationMs, 'number');
});

test('a successful read is not logged, a successful mutation is', async (t) => {
  const lines = captureLines(t);
  const ok = async (_req, res) => res.status(200).json({ ok: true });

  await withApiHandler(ok)(mockReq({ method: 'GET' }), mockRes());
  assert.equal(lines.length, 0, 'reads are the bulk of the traffic and change nothing');

  await withApiHandler(ok)(mockReq({ method: 'POST', url: '/api/events' }), mockRes());
  const mutations = lines.filter((line) => line.event === 'api.mutation');
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].method, 'POST');
});

test('a throwing handler still answers, and logs one error line with context', async (t) => {
  const lines = captureLines(t);
  const req = mockReq({ method: 'POST', url: '/api/auth?action=login', query: { action: 'login' } });
  const res = mockRes();

  await withApiHandler(async () => { throw new Error('boom'); })(req, res);

  assert.equal(res.statusCode, 500);
  const errors = lines.filter((line) => line.event === 'api.error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].status, 500);
  assert.equal(errors[0].action, 'login');
  assert.equal(errors[0].errorName, 'Error');
});

// OBS-001. `void sendSentryEvent(error)` returned before the fetch had gone
// anywhere, and on Vercel the instance is frozen the moment the response is
// written — so production errors frequently never reached Sentry at all.
test('a capture is awaitable, so the response can wait for it', async () => {
  const captured = Sentry.captureException(new Error('boom'));
  assert.equal(typeof captured?.then, 'function');
  await captured;
});

test('a capture never rejects, so awaiting one cannot break error handling', async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDsn = process.env.SENTRY_DSN;
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
  });
  captureLines(t);

  process.env.NODE_ENV = 'production';
  // A DSN whose host cannot resolve: the fetch rejects, and the capture must
  // still settle cleanly rather than turning a handled 500 into an unhandled
  // rejection inside handleError.
  process.env.SENTRY_DSN = 'https://publickey@localhost:1/4242';

  await Sentry.captureException(new Error('boom'));

  const res = mockRes();
  await handleError(res, new Error('boom'), 500, mockReq());
  assert.equal(res.statusCode, 500);
});

// REL-003. decodeURIComponent sat outside the try block, so one malformed
// percent-sequence threw a URIError out of parseCookies — which every
// authenticated route calls before it does anything else. The result was a 500
// on every endpoint, logout included, and no way for the user to self-recover.
test('a malformed cookie does not take the whole request down', () => {
  const cookies = parseCookies({
    headers: { cookie: 'csrf-token=%E0%A4%A; jwt=abc123; theme=dark' },
  });

  assert.equal(cookies.jwt, 'abc123', 'the other cookies still parse');
  assert.equal(cookies.theme, 'dark');
  assert.equal(cookies['csrf-token'], '%E0%A4%A', 'the undecodable value is kept raw');
});

test('a request carrying only a malformed cookie parses to no usable token', () => {
  const cookies = parseCookies({ headers: { cookie: 'jwt=%E0%A4%A' } });
  assert.equal(cookies.jwt, '%E0%A4%A');
});

test('well-formed cookies are still decoded', () => {
  const cookies = parseCookies({ headers: { cookie: 'name=Ada%20Lovelace; jwt=t.o.k' } });
  assert.equal(cookies.name, 'Ada Lovelace');
  assert.equal(cookies.jwt, 't.o.k');
});

test('no cookie header parses to an empty object', () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
});
