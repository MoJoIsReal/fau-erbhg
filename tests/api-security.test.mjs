import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  applySecurityHeaders,
  generateCsrfToken,
  parseAuthToken,
  requireCsrf,
  requireRole,
  validateCsrfToken,
} from '../api/_shared/middleware.js';
import { ADMIN_ONLY, COUNCIL_ROLES } from '../shared/constants.js';
import { getJwtConfig } from '../api/_shared/jwt-config.js';

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

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function tokenFor(userId = 1, tokenVersion = 3) {
  const config = getJwtConfig({ SESSION_SECRET });
  return jwt.sign({ userId, tokenVersion }, config.secret, config.signOptions);
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

test('JWT configuration rejects missing, short, and placeholder secrets', () => {
  assert.throws(() => getJwtConfig({}), /SESSION_SECRET/);
  assert.throws(() => getJwtConfig({ SESSION_SECRET: 'too-short' }), /at least 32/);
  assert.throws(
    () => getJwtConfig({ SESSION_SECRET: 'change-me-this-placeholder-is-long-enough' }),
    /non-placeholder/,
  );
});

test('JWT verification rejects tokens with missing context or wrong algorithm', async (t) => {
  t.mock.method(console, 'error', () => {});
  const legacyToken = jwt.sign({ userId: 1, tokenVersion: 3 }, SESSION_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
  assert.equal(await parseAuthToken(request({ token: legacyToken }), userSql(activeAdmin)), null);
  const wrongAlgorithm = jwt.sign({
    userId: 1,
    tokenVersion: 3,
    iss: 'fau-erdal-barnehage',
    aud: 'fau-erdal-barnehage-web',
  }, SESSION_SECRET, { algorithm: 'HS384', expiresIn: '5m' });
  assert.equal(await parseAuthToken(request({ token: wrongAlgorithm }), userSql(activeAdmin)), null);
});

test('CSRF tokens are random, require both channels, and compare exactly', () => {
  const first = generateCsrfToken();
  const second = generateCsrfToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(validateCsrfToken(request({ csrfCookie: first, csrfHeader: first })), true);
  assert.equal(validateCsrfToken(request({ csrfCookie: first, csrfHeader: second })), false);
  assert.equal(validateCsrfToken(request({ csrfCookie: first })), false);

  const res = response();
  assert.equal(requireCsrf(request({ csrfCookie: first }), res), false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Invalid CSRF token' });
});

test('security headers allow only configured origins and vary by Origin', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const allowed = response();
    applySecurityHeaders(allowed, 'https://www.erdal-bhg.no');
    assert.equal(allowed.getHeader('Access-Control-Allow-Origin'), 'https://www.erdal-bhg.no');
    assert.equal(allowed.getHeader('Access-Control-Allow-Credentials'), 'true');
    assert.equal(allowed.getHeader('Vary'), 'Origin');

    const rejected = response();
    applySecurityHeaders(rejected, 'https://attacker.example');
    assert.equal(rejected.getHeader('Access-Control-Allow-Origin'), undefined);
    assert.equal(rejected.getHeader('Access-Control-Allow-Credentials'), undefined);
    assert.equal(rejected.getHeader('Vary'), 'Origin');
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
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
  const res = response();
  const user = await requireRole(request(), res, ADMIN_ONLY, userSql(activeAdmin));
  assert.equal(user, null);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('wrong role is rejected with 403', async () => {
  const member = { ...activeAdmin, role: 'member' };
  const res = response();
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
  const res = response();
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
  const res = response();
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
