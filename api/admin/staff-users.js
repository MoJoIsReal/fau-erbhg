import bcrypt from 'bcryptjs';
import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
  sanitizeText,
} from './_shared/middleware.js';

export default async function handler(req, res) {
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  try {
    const user = parseAuthToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    if (!requireCsrf(req, res)) return;

    const sql = getDb();

    if (req.method === 'POST') {
      const username = sanitizeText(req.body?.username, 80);
      const name = sanitizeText(req.body?.name, 120);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!username || !name || !password) {
        return res.status(400).json({ error: 'username, name and password are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`;
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Brukernavnet er allerede i bruk' });
      }

      const hashed = await bcrypt.hash(password, 10);
      const now = new Date().toISOString();
      const created = await sql`
        INSERT INTO users (username, password, name, role, created_at)
        VALUES (${username}, ${hashed}, ${name}, 'staff', ${now})
        RETURNING id, username, name, role
      `;

      return res.status(201).json(created[0]);
    }

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, username, name, role, created_at as "createdAt"
        FROM users
        WHERE role = 'staff'
        ORDER BY created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id);
      if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Valid id query parameter required' });
      }
      const deleted = await sql`
        DELETE FROM users WHERE id = ${id} AND role = 'staff' RETURNING id
      `;
      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Staff user not found' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
