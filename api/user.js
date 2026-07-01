import { getDb } from './_shared/database.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
  setCookie,
  generateCsrfToken
} from './_shared/middleware.js';
import { isPasswordChangeRequired } from './_shared/password-policy.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getDb();

    // Use parseAuthToken which reads from cookies (with Bearer token fallback)
    const decoded = await parseAuthToken(req, sql);

    if (!decoded && req.method === 'POST') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!decoded) {
      return res.status(200).json(null);
    }

    if (req.method === 'POST') {
      if (req.query?.action !== 'change-password') {
        return res.status(400).json({ error: 'Invalid action' });
      }
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

      setCookie(res, 'jwt', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 7200,
      });
      setCookie(res, 'csrf-token', csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 7200,
      });

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

    // Get user data
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

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return handleError(res, error);
  }
}
