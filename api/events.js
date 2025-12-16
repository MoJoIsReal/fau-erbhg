import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  logRequest,
  parseAuthToken
} from './_shared/middleware.js';

export default async function handler(req, res) {
  const startTime = Date.now();

  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  try {
    const sql = getDb();

    if (req.method === 'GET') {
      // Get all events including cancelled ones (public access)
      const events = await sql`
        SELECT
          id, title, description, date, time, location,
          custom_location as "customLocation",
          max_attendees as "maxAttendees",
          current_attendees as "currentAttendees",
          type, status, vigilo_signup as "vigiloSignup",
          no_signup as "noSignup"
        FROM events
        WHERE status IN ('active', 'cancelled')
        ORDER BY date ASC, time ASC
      `;

      return res.status(200).json(events);
    }

    if (req.method === 'POST') {
      // JWT authentication check
      const user = parseAuthToken(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user has permission to create events
      if (user.role !== 'admin' && user.role !== 'member') {
        return res.status(403).json({ error: 'Council member access required' });
      }

      // Create new event
      const { title, description, date, time, location, customLocation, maxAttendees, type, vigiloSignup, noSignup } = req.body;

      if (!title || !description || !date || !time || !location || !type) {
        return res.status(400).json({ error: 'Required fields missing' });
      }

      const newEvent = await sql`
        INSERT INTO events (title, description, date, time, location, custom_location, max_attendees, current_attendees, type, status, vigilo_signup, no_signup)
        VALUES (${title}, ${description}, ${date}, ${time}, ${location}, ${customLocation || null}, ${maxAttendees || null}, 0, ${type}, 'active', ${vigiloSignup || false}, ${noSignup || false})
        RETURNING *
      `;

      logRequest(req, startTime);
      return res.status(201).json(newEvent[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    return handleError(res, error);
  } finally {
    logRequest(req, startTime);
  }
}