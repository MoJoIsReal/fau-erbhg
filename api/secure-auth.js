import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { setCookie, generateCsrfToken } from './_shared/middleware.js';

export default async function handler(req, res) {
  // Security headers
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://fau-erdalbhg.vercel.app']
    : ['http://localhost:5000', 'http://localhost:3000'];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    if (!process.env.SESSION_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'POST') {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const users = await sql`
        SELECT id, username, name, password_hash, role 
        FROM users 
        WHERE username = ${username}
      `;

      if (users.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = users[0];
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          name: user.name,
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
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Auth API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}