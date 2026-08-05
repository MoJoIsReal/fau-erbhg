import { getDb } from './_shared/database.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  withApiHandler,
  parseAuthToken,
  setCookie,
  generateCsrfToken,
  requireCsrf,
} from './_shared/middleware.js';
import { checkRateLimit, clearRateLimit, rateLimitKey } from './_shared/rate-limit.js';
import { isPasswordChangeRequired } from './_shared/password-policy.js';

// Consolidates login/logout/current-user/change-password onto one function
// (?action=csrf|login|logout|change-password, default GET = current user) to
// stay within the Vercel Hobby serverless-function budget.

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_IP_MAX_ATTEMPTS = 30;
const LOGIN_ACCOUNT_MAX_ATTEMPTS = 20;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_ACCOUNT_WINDOW_SECONDS = 60 * 60;
const DUMMY_PASSWORD_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8b5Fzi/i8rYJO/8qZjU1BkJ1REsHiy';

function setAuthCookies(res, token, csrfToken) {
  setCookie(res, 'jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7200 // 2 hours in seconds
  });

  setCookie(res, 'csrf-token', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7200 // 2 hours in seconds
  });
}

// GET /api/auth?action=csrf
async function handleCsrf(req, res) {
  const csrfToken = generateCsrfToken();
  setCookie(res, 'csrf-token', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7200
  });
  return res.status(200).json({ csrfToken });
}

// POST /api/auth?action=login  { username, password }
async function handleLogin(req, res, sql) {
  if (!requireCsrf(req, res)) return;

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (!process.env.SESSION_SECRET) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const loginRateLimitKey = rateLimitKey(req, 'login', username);
  const loginIpRateLimitKey = rateLimitKey(req, 'login-ip', '');
  // IP-agnostic per-account limit so a botnet rotating IPs can't bypass
  // the per-(IP, account) limit by spreading attempts across IPs.
  const loginAccountRateLimitKey = `login-account:${String(username).trim().toLowerCase()}`;
  const [rateLimit, ipRateLimit, accountRateLimit] = await Promise.all([
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
    checkRateLimit(sql, {
      key: loginAccountRateLimitKey,
      limit: LOGIN_ACCOUNT_MAX_ATTEMPTS,
      windowSeconds: LOGIN_ACCOUNT_WINDOW_SECONDS
    })
  ]);
  if (!rateLimit.allowed || !ipRateLimit.allowed || !accountRateLimit.allowed) {
    res.setHeader(
      'Retry-After',
      String(Math.max(rateLimit.retryAfter, ipRateLimit.retryAfter, accountRateLimit.retryAfter))
    );
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
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await Promise.all([
    clearRateLimit(sql, loginRateLimitKey),
    clearRateLimit(sql, loginAccountRateLimitKey),
  ]);

  // Create JWT token (2 hour expiration for security)
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.tokenVersion
    },
    process.env.SESSION_SECRET,
    { expiresIn: '2h' }
  );

  const csrfToken = generateCsrfToken();
  setAuthCookies(res, token, csrfToken);

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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 0, // Expire immediately
    path: '/'
  });

  // Clear CSRF token cookie
  setCookie(res, 'csrf-token', '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
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
  if (!process.env.SESSION_SECRET) {
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
    process.env.SESSION_SECRET,
    { expiresIn: '2h' },
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
