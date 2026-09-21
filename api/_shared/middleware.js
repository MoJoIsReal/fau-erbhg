/**
 * Shared middleware utilities for Vercel serverless functions
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import sanitizeHtmlContent from 'sanitize-html';
import Sentry from './sentry.js';
import { redactSensitiveText } from './redact.js';
import { getDb } from './database.js';
import { isPasswordChangeRequired } from './password-policy.js';
import { getJwtConfig } from './jwt-config.js';
import { YOUTUBE_EMBED_HOST, youtubeEmbedSrc } from '../../shared/video-embed.js';

function appendVaryHeader(res, value) {
  const current = res.getHeader?.('Vary');
  if (!current) {
    res.setHeader('Vary', value);
    return;
  }

  const values = String(current).split(',').map((part) => part.trim().toLowerCase());
  if (!values.includes(value.toLowerCase())) {
    res.setHeader('Vary', `${current}, ${value}`);
  }
}

function safeErrorForLog(error) {
  if (!error) return error;
  return {
    name: error.name,
    message: redactSensitiveText(error.message || String(error)),
    stack: error.stack ? redactSensitiveText(error.stack) : undefined,
    code: error.code,
  };
}

/**
 * Apply security headers to API responses
 * @param {Object} res - Response object
 * @param {string} origin - Request origin header
 */
export function applySecurityHeaders(res, origin) {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://fau-erdalbhg.vercel.app', 'https://www.erdal-bhg.no', 'https://erdal-bhg.no']
    : ['http://localhost:5000', 'http://localhost:3000', 'http://127.0.0.1:5000'];

  // CORS handling - only allow specific origins, even in development
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  appendVaryHeader(res, 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-CSRF-Token');

  // X-Content-Type-Options and X-Frame-Options are intentionally not set here:
  // the global headers in vercel.json already apply them to every route,
  // including /api/*, so setting them again here would be pure duplication.
}

/**
 * Handle OPTIONS requests for CORS preflight
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {boolean} - True if OPTIONS was handled, false otherwise
 */
export function handleCorsPreFlight(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Wrap a Vercel serverless function handler with the security headers, CORS
 * preflight handling, and top-level error handling every API route needs.
 * Route handlers just implement their method/action routing and can let
 * errors propagate — this catches them and calls handleError().
 * @param {(req: Object, res: Object) => Promise<any>} handler
 * @returns {(req: Object, res: Object) => Promise<any>}
 */
export function withApiHandler(handler) {
  return async function wrappedHandler(req, res) {
    applySecurityHeaders(res, req.headers.origin);
    if (handleCorsPreFlight(req, res)) return;

    try {
      return await handler(req, res);
    } catch (error) {
      return handleError(res, error);
    }
  };
}

/**
 * Error response handler
 * @param {Object} res - Response object
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code (default: 500)
 */
export function handleError(res, error, statusCode = 500) {
  console.error('API Error:', safeErrorForLog(error));

  // Log error to Sentry in production
  if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
    Sentry.captureException(error);
  }

  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : error.message;

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
}

/**
 * Parse cookies from request
 * @param {Object} req - Request object
 * @returns {Object} - Parsed cookies object
 */
export function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, ...rest] = cookie.split('=');
    const value = rest.join('=').trim();
    if (name) {
      cookies[name.trim()] = decodeURIComponent(value);
    }
    return cookies;
  }, {});
}

/**
 * Set cookie in response
 * @param {Object} res - Response object
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {Object} options - Cookie options
 */
export function setCookie(res, name, value, options = {}) {
  const {
    httpOnly = false,
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'Strict',
    maxAge = 7200, // 2 hours in seconds
    path = '/'
  } = options;

  let cookieString = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`;

  if (httpOnly) {
    cookieString += '; HttpOnly';
  }

  if (secure) {
    cookieString += '; Secure';
  }

  const existingCookies = res.getHeader('Set-Cookie') || [];
  const cookiesArray = Array.isArray(existingCookies) ? existingCookies : [existingCookies];
  res.setHeader('Set-Cookie', [...cookiesArray, cookieString]);
}

/**
 * Generate CSRF token
 * @returns {string} - CSRF token
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate CSRF token from request
 * @param {Object} req - Request object
 * @returns {boolean} - True if CSRF token is valid, false otherwise
 */
export function validateCsrfToken(req) {
  const cookies = parseCookies(req);
  const csrfTokenFromCookie = cookies['csrf-token'];
  const csrfTokenFromHeader = req.headers['x-csrf-token'];

  if (!csrfTokenFromCookie || !csrfTokenFromHeader) {
    return false;
  }

  // Constant-time comparison so the check can't be probed via timing.
  const cookieBuf = Buffer.from(String(csrfTokenFromCookie));
  const headerBuf = Buffer.from(String(csrfTokenFromHeader));
  if (cookieBuf.length !== headerBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(cookieBuf, headerBuf);
}

/**
 * Require CSRF validation for state-changing requests
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {boolean} - True if valid, false otherwise (also sends 403 response)
 */
export function requireCsrf(req, res) {
  if (!validateCsrfToken(req)) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return false;
  }
  return true;
}

/**
 * Parse and validate JWT token from request (cookies or Authorization header)
 * @param {Object} req - Request object
 * @returns {Object|null} - Decoded token payload or null
 */
export async function parseAuthToken(req, sqlClient = null) {
  // First try to get token from HttpOnly cookie
  const cookies = parseCookies(req);
  let token = cookies.jwt;

  // Fall back to Authorization header for backward compatibility
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return null;
  }

  try {
    const jwtConfig = getJwtConfig();
    const decoded = jwt.verify(token, jwtConfig.secret, jwtConfig.verifyOptions);
    if (!Number.isInteger(decoded.tokenVersion)) {
      return null;
    }

    const sql = sqlClient || getDb();
    const users = await sql`
      SELECT username, name, role, token_version as "tokenVersion",
             must_change_password as "mustChangePassword",
             password_changed_at as "passwordChangedAt"
      FROM users
      WHERE id = ${decoded.userId}
      LIMIT 1
    `;
    const user = users[0];
    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return null;
    }

    return {
      ...decoded,
      username: user.username,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt,
      passwordChangeRequired: isPasswordChangeRequired(user),
    };
  } catch (error) {
    if (error.name !== 'TokenExpiredError') {
      console.error('Token validation error:', redactSensitiveText(error.message));
    }
    return null;
  }
}

/**
 * Require authentication for API endpoint
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object|null} - User object if authenticated, null otherwise (also sends 401 response)
 */
export async function requireAuth(req, res, sqlClient = null, options = {}) {
  const user = await parseAuthToken(req, sqlClient);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  if (user.passwordChangeRequired && !options.allowPasswordChangeRequired) {
    res.status(403).json({
      error: 'Password change required',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    return null;
  }

  return user;
}

/**
 * Require an authenticated user with one of the given roles.
 * Writes a 401 or 403 response and returns null on failure.
 * @param {Object} req
 * @param {Object} res
 * @param {string[]} allowedRoles - Role names from shared/constants.ts (COUNCIL_ROLES, ADMIN_ONLY, etc.)
 * @returns {Object|null}
 */
export async function requireRole(req, res, allowedRoles, sqlClient = null, options = {}) {
  const user = await requireAuth(req, res, sqlClient, options);
  if (!user) return null;
  if (!allowedRoles.includes(user.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}

/**
 * Sanitize plain-text input. This is a defense-in-depth pass (strips angle
 * brackets, javascript: URLs, inline event handlers) for fields that are
 * never meant to contain markup — it is NOT a full HTML sanitizer. Fields
 * that render as rich text/HTML must go through sanitizeHtml() instead,
 * which is the actual XSS defense for that case.
 * @param {string} text - Input text to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 1000)
 * @returns {string} - Sanitized text
 */
// Scripting schemes, only where one actually starts: the lookbehind keeps
// ordinary Norwegian prose such as "Kontaktdata: ..." intact while still
// catching a leading "data:text/html,...".
const SCRIPTING_SCHEME = /(?<![\w.-])(?:javascript|vbscript|data)\s*:/gi;

// Every quantifier here is bounded. The previous `on\w+\s*=\s*["'][^"']*["']`
// had no `=` to anchor on, so on an attacker-chosen run like "ondata" repeated
// the engine started at each "on", let `\w+` swallow the rest of the string,
// then backtracked a character at a time looking for an `=` that never came —
// quadratic. 256 KB of that took 11 s, and the field is reachable
// unauthenticated, so one request could burn the whole 30 s function budget.
// Real handler names are short and real values are not megabytes long, so
// bounding each part costs nothing and removes the catastrophic case.
const INLINE_EVENT_HANDLER = /\bon[a-z]{1,20}\s{0,10}=\s{0,10}["'][^"']{0,2000}["']/gi;

// Bytes allowed through the regex passes per character of output budget. The
// passes below only ever shorten the string, so anything beyond this cannot
// affect the first `maxLength` characters of the result — it is pure work.
const SANITIZE_INPUT_FACTOR = 4;

// A single pass lets a nested payload reassemble itself once the inner copy is
// cut out ("javajavascript:script:" leaves "javascript:"), so repeat until the
// string stops changing. Capped: each pass strictly shortens the string, so a
// handful is always enough in practice, and the cap means no input can make
// this loop expensive.
const MAX_STABILIZING_PASSES = 8;

function removeUntilStable(value, pattern) {
  let current = value;
  let previous;
  let passes = 0;
  do {
    previous = current;
    current = current.replace(pattern, '');
    passes += 1;
  } while (current !== previous && passes < MAX_STABILIZING_PASSES);
  return current;
}

// Upper bound on any single raw request field, applied before sanitization.
// Comfortably above every real field (the largest plain-text field is a 5 000
// character contact message) and far below what it takes to make the
// sanitizers expensive, so this only ever rejects abuse.
export const MAX_RAW_FIELD_LENGTH = 64 * 1024;

/**
 * Name of the first top-level field that exceeds the raw-length cap, or null.
 * Handlers call this before sanitizing so an abusive body is refused with a
 * 413 instead of being silently truncated — and, on public endpoints, before
 * the rate limiter is consulted, so oversized bodies cost nothing to reject.
 * @param {Record<string, unknown>} body
 * @param {number} maxLength
 * @returns {string|null}
 */
export function findOversizedField(body, maxLength = MAX_RAW_FIELD_LENGTH) {
  if (!body || typeof body !== 'object') return null;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' && value.length > maxLength) return key;
  }
  return null;
}

export function sanitizeText(text, maxLength = 1000) {
  if (!text || typeof text !== 'string') return '';

  // Bound the input BEFORE any regex runs. sanitizeHtml already does this
  // (it slices to maxLength on the way in); sanitizeText used to truncate only
  // at the very end, so the cap did nothing to limit the work and the full
  // request body was scanned no matter how short the stored value would be.
  const bounded = text.length > maxLength * SANITIZE_INPUT_FACTOR
    ? text.slice(0, maxLength * SANITIZE_INPUT_FACTOR)
    : text;

  const withoutBrackets = bounded.replace(/[<>]/g, ''); // Remove potential HTML tags
  const withoutSchemes = removeUntilStable(withoutBrackets, SCRIPTING_SCHEME);

  return removeUntilStable(withoutSchemes, INLINE_EVENT_HANDLER)
    .trim()
    .substring(0, maxLength);
}

/**
 * Sanitize HTML content (allows basic formatting but prevents XSS)
 * @param {string} html - HTML content to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 10000)
 * @returns {string} - Sanitized HTML
 */
function isCloudinaryImageSrc(src) {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
}

// Fixed for every embed, so an author cannot widen what the frame may do: the
// permissions YouTube's player needs, and nothing else.
const IFRAME_ALLOW = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share';

export function sanitizeHtml(html, maxLength = 10000) {
  if (!html || typeof html !== 'string') return '';

  return sanitizeHtmlContent(html.substring(0, maxLength), {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
      'h1', 'h2', 'h3', 'a', 'img', 'iframe'
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      iframe: ['src', 'title', 'allow', 'allowfullscreen', 'loading']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
      iframe: ['https']
    },
    // Belt and braces alongside the transform below: sanitize-html drops an
    // iframe whose src points anywhere else, before our own check runs.
    allowedIframeHostnames: [YOUTUBE_EMBED_HOST],
    allowIframeRelativeUrls: false,
    transformTags: {
      a: sanitizeHtmlContent.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer'
      }, true),
      // Only allow images hosted in our own Cloudinary account. Stripping the
      // src of any other image prevents an authenticated editor from embedding
      // a third-party tracking pixel that would leak visitors' IPs.
      img: (tagName, attribs) => {
        if (!isCloudinaryImageSrc(attribs.src || '')) {
          return { tagName: 'img', attribs: {} };
        }
        return { tagName: 'img', attribs: { src: attribs.src, alt: attribs.alt || '' } };
      },
      // Video embeds are rebuilt from the video id rather than passed through,
      // so the stored markup is always the same shape no matter what the editor
      // (or a paste) produced. An unembeddable src leaves the iframe without
      // one, and exclusiveFilter below then drops the tag entirely.
      iframe: (tagName, attribs) => {
        const src = youtubeEmbedSrc(attribs.src || '');
        if (!src) return { tagName: 'iframe', attribs: {} };
        return {
          tagName: 'iframe',
          attribs: {
            src,
            title: 'YouTube',
            loading: 'lazy',
            allow: IFRAME_ALLOW,
            allowfullscreen: 'allowfullscreen'
          }
        };
      }
    },
    exclusiveFilter: (frame) => frame.tag === 'iframe' && !frame.attribs.src,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true
  })
    .trim()
    .substring(0, maxLength);
}

/**
 * Sanitize email address
 * @param {string} email - Email to validate and sanitize
 * @returns {string|null} - Sanitized email or null if invalid
 */
export function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return null;

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const trimmedEmail = email.trim().toLowerCase();

  return emailRegex.test(trimmedEmail) ? trimmedEmail : null;
}

/**
 * Sanitize phone number
 * @param {string} phone - Phone number to sanitize
 * @returns {string} - Sanitized phone number
 */
export function sanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';

  // Remove all non-digit and non-+ characters, keep spaces, (), and -
  return phone.replace(/[^\d+\s()-]/g, '').substring(0, 20);
}

/**
 * Validate and sanitize numeric input
 * @param {any} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number|null} - Sanitized number or null if invalid
 */
export function sanitizeNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  if (isNaN(num) || num < min || num > max) return null;
  return num;
}
