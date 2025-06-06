import type { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiting for production security
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

export function createRateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    const now = Date.now();
    const windowStart = now - options.windowMs;
    
    // Clean up old entries
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
    
    const clientData = rateLimitStore.get(clientId);
    
    if (!clientData || clientData.resetTime < now) {
      // New window or client
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + options.windowMs
      });
      return next();
    }
    
    if (clientData.count >= options.maxRequests) {
      return res.status(429).json({
        error: options.message || 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
    }
    
    clientData.count++;
    return next();
  };
}

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.cloudinary.com wss://ws-us3.pusher.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspDirectives);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Prevent caching of sensitive routes
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
}

// Input sanitization middleware
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === 'string') {
        // Remove potential XSS vectors
        obj[key] = obj[key]
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  }
}

// JWT token validation middleware
export function validateJWT(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  try {
    const jwt = require('jsonwebtoken');
    const token = authHeader.substring(7);
    
    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET not configured');
    }
    
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// File upload validation
export function validateFileUpload(allowedTypes: string[], maxSize: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.body.fileData || !req.body.filename) {
      return res.status(400).json({ error: 'File data and filename required' });
    }
    
    // Basic file size check (base64 estimation)
    const estimatedSize = (req.body.fileData.length * 3) / 4;
    if (estimatedSize > maxSize) {
      return res.status(413).json({ error: 'File too large' });
    }
    
    // File extension validation
    const filename = req.body.filename.toLowerCase();
    const hasValidExtension = allowedTypes.some(type => filename.endsWith(type));
    
    if (!hasValidExtension) {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    
    next();
  };
}