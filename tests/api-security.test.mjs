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
import { JWT_AUDIENCE, JWT_ISSUER } from '../api/_shared/jwt-config.js';

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
