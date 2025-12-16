/**
 * Shared middleware utilities for Vercel serverless functions
 */

/**
 * Apply security headers to API responses
 * @param {Object} res - Response object
 * @param {string} origin - Request origin header
 */
export function applySecurityHeaders(res, origin) {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://fau-erdal-barnehage.vercel.app']
    : ['http://localhost:5000', 'http://localhost:3000', 'http://127.0.0.1:5000'];

  // CORS handling - only allow specific origins, even in development
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');

  // Security headers (note: global headers in vercel.json will also apply)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
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
 * Parse and validate JWT token from request
 * @param {Object} req - Request object
 * @returns {Object|null} - Decoded token payload or null
 */
export function parseAuthToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
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
