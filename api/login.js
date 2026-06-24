import { getDb } from './_shared/database.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  setCookie,
  generateCsrfToken,
  requireCsrf
} from './_shared/middleware.js';
import { checkRateLimit, clearRateLimit, rateLimitKey } from './_shared/rate-limit.js';

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_IP_MAX_ATTEMPTS = 30;
const LOGIN_ACCOUNT_MAX_ATTEMPTS = 20;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_ACCOUNT_WINDOW_SECONDS = 60 * 60;
const DUMMY_PASSWORD_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8b5Fzi/i8rYJO/8qZjU1BkJ1REsHiy';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method === 'GET' && req.query?.action === 'csrf') {
    const csrfToken = generateCsrfToken();
    setCookie(res, 'csrf-token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7200
    });
    return res.status(200).json({ csrfToken });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireCsrf(req, res)) return;

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (!process.env.SESSION_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const sql = getDb();
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
      SELECT id, username, name, role, password, token_version as "tokenVersion"
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

    // Generate CSRF token
    const csrfToken = generateCsrfToken();

    // Set JWT in HttpOnly cookie (secure, not accessible to JavaScript)
    setCookie(res, 'jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7200 // 2 hours in seconds
    });

    // Set CSRF token in regular cookie (accessible to JavaScript for sending in headers)
    setCookie(res, 'csrf-token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7200 // 2 hours in seconds
    });

    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      },
      csrfToken // Return CSRF token in response for immediate use
    });

  } catch (error) {
    return handleError(res, error);
  }
}
