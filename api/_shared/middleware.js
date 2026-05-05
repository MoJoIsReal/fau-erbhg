/**
 * Shared middleware utilities for Vercel serverless functions
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Sentry from './sentry.js';

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

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-CSRF-Token');

  // Security headers (note: global headers in vercel.json will also apply)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
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
 * Validate request method
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string[]} allowedMethods - Array of allowed HTTP methods
 * @returns {boolean} - True if method is allowed, false otherwise
 */
export function validateMethod(req, res, allowedMethods) {
  if (!allowedMethods.includes(req.method)) {
    res.status(405).json({
      error: 'Method not allowed',
      allowed: allowedMethods
    });
    return false;
  }
  return true;
}

/**
 * Error response handler
 * @param {Object} res - Response object
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code (default: 500)
 */
export function handleError(res, error, statusCode = 500) {
  console.error('API Error:', error);

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
 * Validate required environment variables
 * @param {string[]} requiredVars - Array of required environment variable names
 * @throws {Error} - Throws if any required variable is missing
 */
export function validateEnvVars(requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Log API request for monitoring
 * @param {Object} req - Request object
 * @param {number} startTime - Request start time in milliseconds
 */
export function logRequest(req, startTime) {
  const duration = Date.now() - startTime;
  const method = req.method;
  const url = req.url;

  console.log(`[${method}] ${url} - ${duration}ms`);
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

  return csrfTokenFromCookie === csrfTokenFromHeader;
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
export function parseAuthToken(req) {
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
    return jwt.verify(token, process.env.SESSION_SECRET);
  } catch (error) {
    console.error('Token validation error:', error.message);
    return null;
  }
}

/**
 * Require authentication for API endpoint
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Object|null} - User object if authenticated, null otherwise (also sends 401 response)
 */
export function requireAuth(req, res) {
  const user = parseAuthToken(req);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return user;
}

/**
 * Sanitize text input to prevent XSS attacks
 * @param {string} text - Input text to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 1000)
 * @returns {string} - Sanitized text
 */
export function sanitizeText(text, maxLength = 1000) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
    .trim()
    .substring(0, maxLength);
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getAttributeValue(attrs, name) {
  const match = attrs.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!match) return null;
  return match[2] || match[3] || match[4] || null;
}

function decodeHtmlEntities(value) {
  return String(value).replace(/&#(x?[0-9a-fA-F]+);?/g, (_, entity) => {
    const codePoint = entity.toLowerCase().startsWith('x')
      ? parseInt(entity.slice(1), 16)
      : parseInt(entity, 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
  });
}

function isSafeUrl(value, allowedProtocols = /^(https?:|mailto:|tel:)/i) {
  if (!value) return false;
  const normalized = decodeHtmlEntities(value).trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  return allowedProtocols.test(normalized);
}

/**
 * Sanitize HTML content (allows basic formatting but prevents XSS)
 * @param {string} html - HTML content to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 10000)
 * @returns {string} - Sanitized HTML
 */
export function sanitizeHtml(html, maxLength = 10000) {
  if (!html || typeof html !== 'string') return '';

  const allowedTags = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
    'h1', 'h2', 'h3', 'a', 'img'
  ]);

  return html
    .substring(0, maxLength)
    .replace(/<\/?\s*([a-z0-9-]+)([^>]*)>/gi, (match, rawTag, attrs = '') => {
      const tag = rawTag.toLowerCase();
      const isClosing = /^<\//.test(match);

      if (!allowedTags.has(tag)) {
        return '';
      }

      if (tag === 'br') {
        return '<br>';
      }

      if (isClosing) {
        return tag === 'img' ? '' : `</${tag}>`;
      }

      if (tag === 'a') {
        const href = getAttributeValue(attrs, 'href');
        if (!isSafeUrl(href)) {
          return '<a>';
        }
        return `<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer">`;
      }

      if (tag === 'img') {
        const src = getAttributeValue(attrs, 'src');
        if (!isSafeUrl(src, /^https?:/i)) {
          return '';
        }
        const alt = getAttributeValue(attrs, 'alt') || '';
        return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}">`;
      }

      return `<${tag}>`;
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
