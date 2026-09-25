import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  applySecurityHeaders,
  findOversizedField,
  generateCsrfToken,
  handleError,
  parseAuthToken,
  requireCsrf,
  requireIntId,
  requireRole,
  setCookie,
  validateCsrfToken,
} from '../api/_shared/middleware.js';
import { ADMIN_ONLY, COUNCIL_ROLES } from '../shared/constants.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../api/_shared/jwt-config.js';
import { mockResponse } from './helpers.mjs';

const SESSION_SECRET = 'test-only-session-secret-with-at-least-32-bytes';
process.env.SESSION_SECRET = SESSION_SECRET;

function request({ token, csrfCookie, csrfHeader } = {}) {
  const cookies = [];
  if (token) cookies.push(`jwt=${encodeURIComponent(token)}`);
  if (csrfCookie) cookies.push(`csrf-token=${encodeURIComponent(csrfCookie)}`);

  return {
    headers: {
      ...(cookies.length > 0 ? { cookie: cookies.join('; ') } : {}),
      ...(csrfHeader ? { 'x-csrf-token': csrfHeader } : {}),
    },
  };
}

// parseAuthToken verifies with getJwtConfig().verifyOptions, which pins the
// issuer and audience — a token minted without them is rejected before the
// role checks these tests are actually about.
function tokenFor(userId = 1, tokenVersion = 3) {
  return jwt.sign({ userId, tokenVersion }, SESSION_SECRET, {
    expiresIn: '5m',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function userSql(user) {
  return async () => user ? [user] : [];
}

const activeAdmin = {
  username: 'admin@example.test',
  name: 'Admin',
  role: 'admin',
  tokenVersion: 3,
  mustChangePassword: false,
  passwordChangedAt: new Date().toISOString(),
};

test('CSRF tokens are random, require both channels, and compare exactly', () => {
  const first = generateCsrfToken();
  const second = generateCsrfToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(validateCsrfToken(request({ csrfCookie: first, csrfHeader: first })), true);
  assert.equal(validateCsrfToken(request({ csrfCookie: first, csrfHeader: second })), false);
  assert.equal(validateCsrfToken(request({ csrfCookie: first })), false);

  const res = mockResponse();
  assert.equal(requireCsrf(request({ csrfCookie: first }), res), false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Invalid CSRF token' });
});

test('security headers allow only configured origins and vary by Origin', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const allowed = mockResponse();
    applySecurityHeaders(allowed, 'https://www.erdal-bhg.no');
    assert.equal(allowed.getHeader('Access-Control-Allow-Origin'), 'https://www.erdal-bhg.no');
    assert.equal(allowed.getHeader('Access-Control-Allow-Credentials'), 'true');
    assert.equal(allowed.getHeader('Vary'), 'Origin');

    const rejected = mockResponse();
    applySecurityHeaders(rejected, 'https://attacker.example');
    assert.equal(rejected.getHeader('Access-Control-Allow-Origin'), undefined);
    assert.equal(rejected.getHeader('Access-Control-Allow-Credentials'), undefined);
    assert.equal(rejected.getHeader('Vary'), 'Origin');
  } finally {
    // Assigning undefined would store the string "undefined".
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

// SEC-007. Everything that was not 'production' used to count as development:
// a deployment without NODE_ENV answered with raw error text, set cookies
// without Secure and allowed only localhost origins.
test('only an explicit NODE_ENV=development relaxes redaction, cookie security and CORS', async (t) => {
  const previousNodeEnv = process.env.NODE_ENV;
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });
  t.mock.method(console, 'error', () => {});
  for (const nodeEnv of [undefined, '', 'production', 'preview', 'Production', 'development']) {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    const local = nodeEnv === 'development';
    const label = `NODE_ENV=${nodeEnv}`;

    const failed = mockResponse();
    await handleError(failed, new Error('relation "users" does not exist'));
    assert.equal(failed.statusCode, 500, label);
    assert.equal(failed.body.error, local ? 'relation "users" does not exist' : 'Internal server error', label);
    assert.equal('stack' in failed.body, local, label);

    const cookie = mockResponse();
    setCookie(cookie, 'jwt', 'x', { httpOnly: true });
    assert.equal(cookie.getHeader('Set-Cookie')[0].endsWith('; Secure'), !local, label);

    const cors = mockResponse();
    applySecurityHeaders(cors, 'https://www.erdal-bhg.no');
    assert.equal(cors.getHeader('Access-Control-Allow-Origin'), local ? undefined : 'https://www.erdal-bhg.no', label);
  }
});

test('JWT identity and role are refreshed from the database', async () => {
  const decoded = await parseAuthToken(
    request({ token: tokenFor() }),
    userSql(activeAdmin),
  );

  assert.equal(decoded.userId, 1);
  assert.equal(decoded.username, activeAdmin.username);
  assert.equal(decoded.role, 'admin');
  assert.equal(decoded.passwordChangeRequired, false);
});

test('missing identity is rejected with 401', async () => {
  const res = mockResponse();
  const user = await requireRole(request(), res, ADMIN_ONLY, userSql(activeAdmin));
  assert.equal(user, null);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('wrong role is rejected with 403', async () => {
  const member = { ...activeAdmin, role: 'member' };
  const res = mockResponse();
  const user = await requireRole(
    request({ token: tokenFor() }),
    res,
    ADMIN_ONLY,
    userSql(member),
  );
  assert.equal(user, null);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Forbidden' });
});

test('allowed roles receive the database-backed principal', async () => {
  const member = { ...activeAdmin, role: 'member' };
  const res = mockResponse();
  const user = await requireRole(
    request({ token: tokenFor() }),
    res,
    COUNCIL_ROLES,
    userSql(member),
  );
  assert.equal(user.role, 'member');
  assert.equal(res.statusCode, 200);
});

test('revoked token version and missing account are rejected', async () => {
  assert.equal(
    await parseAuthToken(request({ token: tokenFor() }), userSql({ ...activeAdmin, tokenVersion: 4 })),
    null,
  );
  assert.equal(await parseAuthToken(request({ token: tokenFor() }), userSql(null)), null);
});

test('password-change-required principal is blocked before role authorization', async () => {
  const res = mockResponse();
  const user = await requireRole(
    request({ token: tokenFor() }),
    res,
    ADMIN_ONLY,
    userSql({ ...activeAdmin, mustChangePassword: true }),
  );
  assert.equal(user, null);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    error: 'Password change required',
    code: 'PASSWORD_CHANGE_REQUIRED',
  });
});

// Several handlers passed req.query.id straight into `WHERE id = ${id}` against
// an integer column, so ?id=abc produced a PostgreSQL 22P02 and a blanket 500
// rather than a 400 naming the problem.
test('requireIntId accepts positive integers and rejects everything else', () => {
  const call = (query) => {
    const res = mockResponse();
    return { id: requireIntId({ query }, res), res };
  };

  assert.equal(call({ id: '42' }).id, 42);
  assert.equal(call({ id: 42 }).id, 42);

  for (const query of [
    { id: 'abc' }, { id: '' }, {}, { id: '0' }, { id: '-3' }, { id: '1.5' },
    { id: '1; DROP TABLE users' }, { id: ['1', '2'] }, { id: 'NaN' },
    // Past PostgreSQL's integer: the query would fail with "out of range".
    { id: '2147483648' }, { id: ['7'] }, { id: '  ' },
  ]) {
    const { id, res } = call(query);
    assert.equal(id, null, `${JSON.stringify(query)} should be rejected`);
    assert.equal(res.statusCode, 400, `${JSON.stringify(query)} should answer 400, not 500`);
    assert.match(res.body.error, /Valid id query parameter required/);
  }
});

// The public endpoints sanitize untrusted text, which is real work; the limiter
// has to see the request before that work happens, or it cannot bound it.
test('oversized fields are detected before sanitization runs', () => {
  assert.equal(findOversizedField({ message: 'a'.repeat(100) }), null);
  assert.equal(findOversizedField({ name: 'ok', message: 'a'.repeat(70_000) }), 'message');
  assert.equal(findOversizedField({}), null);
  assert.equal(findOversizedField(null), null);
  assert.equal(findOversizedField({ count: 12345 }), null, 'non-strings are not length-checked');
});

test('cookies default to SameSite=Strict and append rather than replace', () => {
  const res = mockResponse();
  setCookie(res, 'jwt', 'a b', { httpOnly: true, secure: true, maxAge: 60 });
  setCookie(res, 'csrf-token', 'x', { secure: false });
  assert.deepEqual(res.getHeader('Set-Cookie'), [
    'jwt=a%20b; Path=/; Max-Age=60; SameSite=Strict; HttpOnly; Secure',
    'csrf-token=x; Path=/; Max-Age=7200; SameSite=Strict',
  ]);
});
