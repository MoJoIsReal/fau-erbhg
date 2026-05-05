import { getDb } from './_shared/database.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  setCookie,
  generateCsrfToken
} from './_shared/middleware.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function checkLoginRateLimit(req, username) {
  const now = Date.now();
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const key = `${getClientIp(req)}:${normalizedUsername}`;
  const current = loginAttempts.get(key);

  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true };
  }

  current.count += 1;

  if (current.count > LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

function clearLoginRateLimit(req, username) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  loginAttempts.delete(`${getClientIp(req)}:${normalizedUsername}`);
}

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (!process.env.SESSION_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const rateLimit = checkLoginRateLimit(req, username);
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfter));
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }

    const sql = getDb();
    
    // Get user by username (email)
    const users = await sql`
      SELECT id, username, name, role, password 
      FROM users 
      WHERE username = ${username}
    `;

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    
    // Verify password
    const isValid = await bcryptjs.compare(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearLoginRateLimit(req, username);

    // Create JWT token (2 hour expiration for security)
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role
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
