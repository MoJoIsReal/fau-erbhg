import { getDb } from './_shared/database.js';
import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  withApiHandler,
  parseAuthToken,
  parseCookies,
  setCookie,
  generateCsrfToken,
  requireCsrf,
} from './_shared/middleware.js';
import {
  checkRateLimit,
  clearRateLimit,
  identityRateLimitKey,
  peekRateLimit,
  rateLimitKey,
} from './_shared/rate-limit.js';
import { isPasswordChangeRequired } from './_shared/password-policy.js';
import { getJwtConfig, JWT_ALGORITHM, JWT_ISSUER } from './_shared/jwt-config.js';

// Consolidates login/logout/current-user/change-password onto one function
// (?action=csrf|login|logout|change-password, default GET = current user) to
// stay within the Vercel Hobby serverless-function budget.

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_IP_MAX_ATTEMPTS = 30;
const LOGIN_ACCOUNT_MAX_FAILURES = 20;
const LOGIN_DEVICE_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_ACCOUNT_WINDOW_SECONDS = 60 * 60;
const DUMMY_PASSWORD_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8b5Fzi/i8rYJO/8qZjU1BkJ1REsHiy';

// Account lockout without handing anyone a way to lock a member out.
//
// The account-wide limit exists for a guesser who rotates IPs. It used to count
// every attempt and be checked before the password, so anyone who knew a
// council member's username could keep that member out by sending ~21 requests
// an hour. Now the limit counts only failures, and a browser that has signed in
// to this account before carries a signed "known device" cookie that lets it
// past the account lock (OWASP "device cookies"). A guesser without one is
// still stopped; the member's own phone or laptop is not. A known browser is
// held to its own attempt limit instead, so a stolen cookie is no free pass.
const DEVICE_COOKIE = 'login-device';
const DEVICE_AUDIENCE = 'fau-erdal-barnehage-device';
const DEVICE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

// The cookie names the account by a digest, not the address.
function accountDigest(username) {
  return crypto.createHash('sha256').update(String(username).trim().toLowerCase()).digest('hex');
}

// The device id when the request carries a valid known-device cookie for this
// account, otherwise null. A different audience from the session token keeps
// either one from being accepted as the other.
function knownDevice(req, username, jwtConfig) {
  const token = parseCookies(req)[DEVICE_COOKIE];
  if (!token) return null;
  try {
    const claims = jwt.verify(token, jwtConfig.secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: DEVICE_AUDIENCE,
      subject: accountDigest(username),
    });
    return typeof claims === 'object' && typeof claims.jti === 'string' ? claims.jti : null;
  } catch {
    return null;
  }
}

function setDeviceCookie(res, username, jwtConfig) {
  const token = jwt.sign({}, jwtConfig.secret, {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: DEVICE_AUDIENCE,
    subject: accountDigest(username),
    jwtid: crypto.randomBytes(16).toString('hex'),
    expiresIn: DEVICE_MAX_AGE_SECONDS,
  });
  setCookie(res, DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: DEVICE_MAX_AGE_SECONDS,
    path: '/api/auth',
  });
}

function setAuthCookies(res, token, csrfToken) {
  setCookie(res, 'jwt', token, {
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: 7200 // 2 hours in seconds
  });

  setCookie(res, 'csrf-token', csrfToken, {
    httpOnly: false,
    sameSite: 'Strict',
    maxAge: 7200 // 2 hours in seconds
  });
}

// GET /api/auth?action=csrf
async function handleCsrf(req, res) {
  const csrfToken = generateCsrfToken();
  setCookie(res, 'csrf-token', csrfToken, {
    httpOnly: false,
    sameSite: 'Strict',
    maxAge: 7200
  });
  return res.status(200).json({ csrfToken });
}

// POST /api/auth?action=login  { username, password }
async function handleLogin(req, res, sql) {
  if (!requireCsrf(req, res)) return;

  const { username, password } = req.body || {};

  // Strings only: an object or array password used to reach bcrypt and come
  // back as a 500, and a non-string username the rate-limit keys.
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  let jwtConfig;
  try {
    jwtConfig = getJwtConfig();
  } catch {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const loginRateLimitKey = rateLimitKey(req, 'login', username);
  const loginIpRateLimitKey = rateLimitKey(req, 'login-ip', '');
  // IP-agnostic, so a botnet rotating IPs can't spread its guesses past the
  // per-(IP, account) limit. Counts failures only (recorded below).
  const accountFailureKey = identityRateLimitKey('login-account', username);
  const device = knownDevice(req, username, jwtConfig);
  const limits = await Promise.all([
    checkRateLimit(sql, {
      key: loginRateLimitKey,
      limit: LOGIN_MAX_ATTEMPTS,
      windowSeconds: LOGIN_WINDOW_SECONDS
    }),
    checkRateLimit(sql, {
      key: loginIpRateLimitKey,
      limit: LOGIN_IP_MAX_ATTEMPTS,
      windowSeconds: LOGIN_WINDOW_SECONDS
    }),
    device
      ? checkRateLimit(sql, {
        key: identityRateLimitKey('login-device', device),
        limit: LOGIN_DEVICE_MAX_ATTEMPTS,
        windowSeconds: LOGIN_WINDOW_SECONDS
      })
      : peekRateLimit(sql, { key: accountFailureKey, limit: LOGIN_ACCOUNT_MAX_FAILURES }),
  ]);
  if (limits.some((limit) => !limit.allowed)) {
    res.setHeader('Retry-After', String(Math.max(...limits.map((limit) => limit.retryAfter))));
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  // Get user by username (email)
  const users = await sql`
    SELECT id, username, name, role, password, token_version as "tokenVersion",
           must_change_password as "mustChangePassword",
           password_changed_at as "passwordChangedAt"
    FROM users
    WHERE username = ${username}
  `;

  const user = users[0];

  // Always run bcrypt to reduce username-existence timing leaks.
  const isValid = await bcryptjs.compare(password, user?.password || DUMMY_PASSWORD_HASH);

  if (!user || !isValid) {
    await checkRateLimit(sql, {
      key: accountFailureKey,
      limit: LOGIN_ACCOUNT_MAX_FAILURES,
      windowSeconds: LOGIN_ACCOUNT_WINDOW_SECONDS
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // A success from an unknown browser means the account was not locked, so
  // its failures are forgiven. One through a known browser says nothing about
  // who produced them, so the lock is left to expire on its own.
  await Promise.all([
    clearRateLimit(sql, loginRateLimitKey),
    device ? null : clearRateLimit(sql, accountFailureKey),
  ]);

  // Create JWT token (2 hour expiration for security)
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion
    },
    jwtConfig.secret,
    jwtConfig.signOptions
  );

  const csrfToken = generateCsrfToken();
  setAuthCookies(res, token, csrfToken);
  setDeviceCookie(res, user.username, jwtConfig);

  return res.status(200).json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      passwordChangeRequired: isPasswordChangeRequired(user),
    },
    csrfToken // Return CSRF token in response for immediate use
  });
}

// POST /api/auth?action=logout
async function handleLogout(req, res, sql) {
  const user = await parseAuthToken(req, sql);

  if (!requireCsrf(req, res)) return;

  if (user) {
    await sql`
      UPDATE users
      SET token_version = token_version + 1
      WHERE id = ${user.userId}
    `;
  }

  // Clear JWT cookie (HttpOnly)
  setCookie(res, 'jwt', '', {
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: 0, // Expire immediately
    path: '/'
  });

  // Clear CSRF token cookie
  setCookie(res, 'csrf-token', '', {
    httpOnly: false,
    sameSite: 'Strict',
    maxAge: 0, // Expire immediately
    path: '/'
  });

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
}

// POST /api/auth?action=change-password  { currentPassword, newPassword }
async function handleChangePassword(req, res, sql, decoded) {
  if (!requireCsrf(req, res)) return;

  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 12) {
    return res.status(400).json({ error: 'New password must be at least 12 characters' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password' });
  }
  let jwtConfig;
  try {
    jwtConfig = getJwtConfig();
  } catch {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const rows = await sql`
    SELECT id, username, name, role, password, token_version as "tokenVersion"
    FROM users
    WHERE id = ${decoded.userId}
    LIMIT 1
  `;
  const existingUser = rows[0];
  if (!existingUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const passwordIsValid = await bcryptjs.compare(currentPassword, existingUser.password);
  if (!passwordIsValid) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const passwordHash = await bcryptjs.hash(newPassword, 10);
  const now = new Date().toISOString();
  const updatedRows = await sql`
    UPDATE users
    SET password = ${passwordHash},
        must_change_password = false,
        password_changed_at = ${now},
        token_version = token_version + 1
    WHERE id = ${decoded.userId}
    RETURNING id, username, name, role, token_version as "tokenVersion",
              must_change_password as "mustChangePassword",
              password_changed_at as "passwordChangedAt"
  `;
  const updatedUser = updatedRows[0];

  const token = jwt.sign(
    {
      userId: updatedUser.id,
      username: updatedUser.username,
      role: updatedUser.role,
      tokenVersion: updatedUser.tokenVersion,
    },
    jwtConfig.secret,
    jwtConfig.signOptions,
  );
  const csrfToken = generateCsrfToken();
  setAuthCookies(res, token, csrfToken);

  return res.status(200).json({
    user: {
      userId: updatedUser.id,
      username: updatedUser.username,
      name: updatedUser.name,
      role: updatedUser.role,
      passwordChangeRequired: false,
    },
    csrfToken,
  });
}

// GET /api/auth (default) or ?action=me
async function handleMe(req, res, sql, decoded) {
  const users = await sql`
    SELECT id, username, name, role,
           must_change_password as "mustChangePassword",
           password_changed_at as "passwordChangedAt"
    FROM users
    WHERE id = ${decoded.userId}
  `;

  if (users.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = users[0];
  return res.status(200).json({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    passwordChangeRequired: isPasswordChangeRequired(user),
  });
}

export default withApiHandler(async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();
  const { action } = req.query;

  if (req.method === 'GET') {
    if (action === 'csrf') {
      return handleCsrf(req, res);
    }

    if (!action || action === 'me') {
      const decoded = await parseAuthToken(req, sql);
      if (!decoded) return res.status(200).json(null);
      return handleMe(req, res, sql, decoded);
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  // req.method === 'POST'
  if (action === 'login') {
    return handleLogin(req, res, sql);
  }

  if (action === 'logout') {
    return handleLogout(req, res, sql);
  }

  if (action === 'change-password') {
    const decoded = await parseAuthToken(req, sql);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
    return handleChangePassword(req, res, sql, decoded);
  }

  return res.status(400).json({ error: 'Invalid action' });
});
