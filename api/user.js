import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken
} from './_shared/middleware.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use parseAuthToken which reads from cookies (with Bearer token fallback)
    const decoded = parseAuthToken(req);

    if (!decoded) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const sql = getDb();
    
    // Get user data
    const users = await sql`
      SELECT id, username, name, role 
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
      role: user.role
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return handleError(res, error);
  }
}