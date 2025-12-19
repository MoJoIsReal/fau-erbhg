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