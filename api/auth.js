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
  rateLimitKey,
  sendPublicMail,
} from './_shared/rate-limit.js';
import { isPasswordChangeRequired, isTemporaryPasswordExpired } from './_shared/password-policy.js';
import { getJwtConfig, JWT_ALGORITHM, JWT_ISSUER } from './_shared/jwt-config.js';
import { isEmailConfigured, sendEmail } from './_shared/email.js';
import { publicBaseUrl } from './_shared/newsletter.js';
import { reportProviderError } from './_shared/provider-errors.js';

// Consolidates login/logout/current-user/change-password/password reset onto
// one function (?action=csrf|login|logout|change-password|forgot-password|
// reset-password, default GET = current user) to stay within the Vercel Hobby
// serverless-function budget.

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_IP_MAX_ATTEMPTS = 30;
const LOGIN_ACCOUNT_MAX_FAILURES = 20;
const LOGIN_DEVICE_MAX_ATTEMPTS = 10;
const CHANGE_PASSWORD_MAX_ATTEMPTS = 5;
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

// Self-service password reset. The mailed link carries a signed token naming
// the account and its token_version, which every password change, admin
// re-issue and logout bumps: the link works once, for an hour, and dies as
// soon as anything else changes the account's credentials. Nothing is stored.
const RESET_AUDIENCE = 'fau-erdal-barnehage-password-reset';
const RESET_MAX_AGE_SECONDS = 60 * 60;
const RESET_REQUEST_IP_MAX_ATTEMPTS = 5;
const RESET_REQUEST_ACCOUNT_MAX_ATTEMPTS = 3;
const RESET_IP_MAX_ATTEMPTS = 10;
const MIN_PASSWORD_LENGTH = 12;

// Accounts are stored with the address lowercased (sanitizeEmail), so the
// address typed at login is compared the same way.
function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

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
    return res.status(400).json({ error: 'Username and password required', code: 'REQUIRED_FIELDS' });
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
  // per-(IP, account) limit. Counts failures only: an unknown browser's
  // attempt is reserved before the password check and cleared on success.
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
      : null,
  ].filter(Boolean));
  if (limits.some((limit) => !limit.allowed)) {
    res.setHeader('Retry-After', String(Math.max(...limits.map((limit) => limit.retryAfter))));
    return res.status(429).json({ error: 'Too many login attempts. Try again later.', code: 'RATE_LIMITED' });
  }

  // An unknown browser's attempt is counted against the account before the
  // password is checked, so concurrent guesses from many IPs cannot all read
  // the count before any of them has added to it. A success clears it below.
  // Counted only once the per-IP limits have passed, so requests they refuse
  // never run the account count up.
  if (!device) {
    const accountLimit = await checkRateLimit(sql, {
      key: accountFailureKey,
      limit: LOGIN_ACCOUNT_MAX_FAILURES,
      windowSeconds: LOGIN_ACCOUNT_WINDOW_SECONDS
    });
    if (!accountLimit.allowed) {
      res.setHeader('Retry-After', String(accountLimit.retryAfter));
      return res.status(429).json({ error: 'Too many login attempts. Try again later.', code: 'RATE_LIMITED' });
    }
  }

  // Get user by username (email). Case and surrounding spaces are not part
  // of an address: "Ola@Example.no " from a phone keyboard is the same account.
  const users = await sql`
    SELECT id, username, name, role, password, token_version as "tokenVersion",
           must_change_password as "mustChangePassword",
           password_changed_at as "passwordChangedAt",
           temp_password_expires_at as "tempPasswordExpiresAt"
    FROM users
    WHERE lower(username) = ${normalizeUsername(username)}
  `;

  const user = users[0];

  // Always run bcrypt to reduce username-existence timing leaks.
  const isValid = await bcryptjs.compare(password, user?.password || DUMMY_PASSWORD_HASH);

  if (!user || !isValid) {
    // An unknown browser's failure was counted above. A known browser is held
    // to its own attempt limit, so its failure can be recorded afterwards.
    if (device) {
      await checkRateLimit(sql, {
        key: accountFailureKey,
        limit: LOGIN_ACCOUNT_MAX_FAILURES,
        windowSeconds: LOGIN_ACCOUNT_WINDOW_SECONDS
      });
    }
    return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  }

  // The right temporary password, but its week is over: no session. Told
  // apart from a wrong password only after the password matched, so it says
  // nothing to someone guessing.
  if (user.mustChangePassword && isTemporaryPasswordExpired(user)) {
    return res.status(401).json({ error: 'Temporary password has expired', code: 'TEMP_PASSWORD_EXPIRED' });
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
      userId: user.id,
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
    return res.status(400).json({ error: 'Current password and new password are required', code: 'REQUIRED_FIELDS' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'New password must be at least 12 characters', code: 'PASSWORD_TOO_SHORT' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password', code: 'PASSWORD_UNCHANGED' });
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

  // A session (an unlocked shared computer, a stolen cookie) must not become
  // an unthrottled oracle for the account's password: each attempt is counted
  // before bcrypt, as on login, and a success clears the count.
  const attemptKey = identityRateLimitKey('change-password', decoded.userId);
  const attempts = await checkRateLimit(sql, {
    key: attemptKey,
    limit: CHANGE_PASSWORD_MAX_ATTEMPTS,
    windowSeconds: LOGIN_WINDOW_SECONDS
  });
  if (!attempts.allowed) {
    res.setHeader('Retry-After', String(attempts.retryAfter));
    return res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' });
  }

  const passwordIsValid = await bcryptjs.compare(currentPassword, existingUser.password);
  if (!passwordIsValid) {
    return res.status(400).json({ error: 'Current password is incorrect', code: 'CURRENT_PASSWORD_INCORRECT' });
  }
  await clearRateLimit(sql, attemptKey);

  const passwordHash = await bcryptjs.hash(newPassword, 10);
  const now = new Date().toISOString();
  const updatedRows = await sql`
    UPDATE users
    SET password = ${passwordHash},
        must_change_password = false,
        password_changed_at = ${now},
        temp_password_expires_at = NULL,
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

// The mail with the reset link. Norwegian only, like the account mail.
function resetMail({ username, name, token }) {
  return {
    to: username,
    subject: 'Nytt passord for FAU Erdal Barnehage',
    text: [
      `Hei ${name},`,
      '',
      'Noen (forhåpentligvis du) ba om å lage nytt passord til FAU Erdal Barnehage sin nettside.',
      'Åpne lenken for å velge et nytt passord:',
      '',
      // In the fragment, so the token never reaches a server log or a Referer.
      `${publicBaseUrl()}/nytt-passord#${token}`,
      '',
      `Lenken virker i ${RESET_MAX_AGE_SECONDS / 60} minutter og kan brukes én gang. Har du ikke bedt om dette, kan du se bort fra e-posten. Passordet ditt er uendret.`,
      '',
      'Vennlig hilsen',
      'FAU Erdal Barnehage',
    ].join('\n'),
  };
}

// POST /api/auth?action=forgot-password  { username }
// Always the same answer whether or not the address has an account, so the
// form tells nobody who sits on the council. Nothing about the account
// changes until the link is used, so asking cannot lock anyone out.
async function handleForgotPassword(req, res, sql) {
  if (!requireCsrf(req, res)) return;

  const username = typeof req.body?.username === 'string' ? normalizeUsername(req.body.username) : '';
  if (!username) {
    return res.status(400).json({ error: 'Username required', code: 'REQUIRED_FIELDS' });
  }
  if (!isEmailConfigured()) {
    return res.status(500).json({ error: 'Email is not configured', code: 'EMAIL_NOT_CONFIGURED' });
  }

  let jwtConfig;
  try {
    jwtConfig = getJwtConfig();
  } catch {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Counted per address whether or not it has an account, so a refusal
  // says nothing about it either.
  const limits = await Promise.all([
    checkRateLimit(sql, {
      key: rateLimitKey(req, 'password-reset-request-ip', ''),
      limit: RESET_REQUEST_IP_MAX_ATTEMPTS,
      windowSeconds: LOGIN_WINDOW_SECONDS
    }),
    checkRateLimit(sql, {
      key: identityRateLimitKey('password-reset-request', username),
      limit: RESET_REQUEST_ACCOUNT_MAX_ATTEMPTS,
      windowSeconds: LOGIN_ACCOUNT_WINDOW_SECONDS
    }),
  ]);
  if (limits.some((limit) => !limit.allowed)) {
    res.setHeader('Retry-After', String(Math.max(...limits.map((limit) => limit.retryAfter))));
    return res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' });
  }

  const users = await sql`
    SELECT id, username, name, token_version as "tokenVersion"
    FROM users
    WHERE lower(username) = ${username}
    LIMIT 1
  `;
  const user = users[0];
  if (user) {
    const token = jwt.sign({ tv: user.tokenVersion }, jwtConfig.secret, {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: RESET_AUDIENCE,
      subject: String(user.id),
      expiresIn: RESET_MAX_AGE_SECONDS,
    });
    try {
      // Within the shared daily mail budget, so a caller cycling through the
      // members' addresses cannot spend the quota the newsletter needs.
      await sendPublicMail(sql, 'password-reset', () => sendEmail(resetMail({ username: user.username, name: user.name, token })));
    } catch (error) {
      // Reported, not answered: a failure only an existing account can
      // produce would tell the caller the address is a member's.
      reportProviderError('password-reset.mail', error);
    }
  }

  return res.status(200).json({ success: true });
}

// POST /api/auth?action=reset-password  { token, newPassword }
async function handleResetPassword(req, res, sql) {
  if (!requireCsrf(req, res)) return;

  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required', code: 'REQUIRED_FIELDS' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: 'New password must be at least 12 characters', code: 'PASSWORD_TOO_SHORT' });
  }

  let jwtConfig;
  try {
    jwtConfig = getJwtConfig();
  } catch {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const limit = await checkRateLimit(sql, {
    key: rateLimitKey(req, 'password-reset-ip', ''),
    limit: RESET_IP_MAX_ATTEMPTS,
    windowSeconds: LOGIN_WINDOW_SECONDS
  });
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' });
  }

  let claims;
  try {
    claims = jwt.verify(token, jwtConfig.secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: RESET_AUDIENCE,
    });
  } catch {
    claims = null;
  }
  const userId = typeof claims === 'object' && claims ? Number(claims.sub) : NaN;
  const tokenVersion = typeof claims === 'object' && claims ? claims.tv : undefined;
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(tokenVersion)) {
    return res.status(400).json({ error: 'Reset link is invalid or expired', code: 'RESET_LINK_INVALID' });
  }

  // The token_version match makes the link single-use: the first reset bumps
  // it, and so does any other password change or logout in the meantime.
  const passwordHash = await bcryptjs.hash(newPassword, 10);
  const now = new Date().toISOString();
  const updatedRows = await sql`
    UPDATE users
    SET password = ${passwordHash},
        must_change_password = false,
        password_changed_at = ${now},
        temp_password_expires_at = NULL,
        token_version = token_version + 1
    WHERE id = ${userId} AND token_version = ${tokenVersion}
    RETURNING id, username, name, role, token_version as "tokenVersion"
  `;
  const updatedUser = updatedRows[0];
  if (!updatedUser) {
    return res.status(400).json({ error: 'Reset link is invalid or expired', code: 'RESET_LINK_INVALID' });
  }

  // Whoever holds the mailbox has proved more than a password would, so any
  // lock built up by guesses elsewhere is lifted along with the old password.
  await clearRateLimit(sql, identityRateLimitKey('login-account', updatedUser.username));

  const sessionToken = jwt.sign(
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
  setAuthCookies(res, sessionToken, csrfToken);
  setDeviceCookie(res, updatedUser.username, jwtConfig);

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

  if (action === 'forgot-password') {
    return handleForgotPassword(req, res, sql);
  }

  if (action === 'reset-password') {
    return handleResetPassword(req, res, sql);
  }

  return res.status(400).json({ error: 'Invalid action' });
});
