import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
  sanitizeText,
  sanitizeHtml,
  sanitizeNumber
} from './_shared/middleware.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  try {
    const sql = getDb();

    if (req.method === 'GET') {
      // Public access - Get all active and cancelled events
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

    // All other methods require authentication
    const user = parseAuthToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // CSRF protection for state-changing requests
    if (!requireCsrf(req, res)) return;

    if (req.method === 'POST') {
      // Check permissions
      if (user.role !== 'admin' && user.role !== 'member') {
        return res.status(403).json({ error: 'Council member access required' });
      }

      const { title, description, date, time, location, custom_location, max_attendees, type, vigiloSignup, noSignup } = req.body;

      // Sanitize inputs
      const sanitizedTitle = sanitizeText(title, 200);
      const sanitizedDescription = sanitizeHtml(description, 5000);
      const sanitizedLocation = sanitizeText(location, 200);
      const sanitizedCustomLocation = custom_location ? sanitizeText(custom_location, 200) : null;
      const sanitizedMaxAttendees = max_attendees ? sanitizeNumber(max_attendees, 0, 1000) : null;
      const sanitizedType = ['meeting', 'event', 'activity', 'dugnad', 'internal', 'other'].includes(type) ? type : 'meeting';

      if (!sanitizedTitle || !date || !time) {
        return res.status(400).json({ error: 'Valid title, date, and time are required' });
      }

      const newEvent = await sql`
        INSERT INTO events (title, description, date, time, location, custom_location, max_attendees, type, vigilo_signup, no_signup)
        VALUES (${sanitizedTitle}, ${sanitizedDescription}, ${date}, ${time}, ${sanitizedLocation}, ${sanitizedCustomLocation}, ${sanitizedMaxAttendees}, ${sanitizedType}, ${vigiloSignup || false}, ${noSignup || false})
        RETURNING *
      `;

      // Map database fields to frontend camelCase
      const mappedEvent = {
        ...newEvent[0],
        customLocation: newEvent[0].custom_location,
        maxAttendees: newEvent[0].max_attendees,
        currentAttendees: newEvent[0].current_attendees,
        vigiloSignup: newEvent[0].vigilo_signup,
        noSignup: newEvent[0].no_signup
      };

      return res.status(201).json(mappedEvent);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      const { title, description, date, time, location, customLocation, maxAttendees, type, vigiloSignup, noSignup } = req.body;

      // Sanitize inputs
      const sanitizedTitle = sanitizeText(title, 200);
      const sanitizedDescription = sanitizeHtml(description, 5000);
      const sanitizedLocation = sanitizeText(location, 200);
      const sanitizedCustomLocation = customLocation ? sanitizeText(customLocation, 200) : null;
      const sanitizedMaxAttendees = maxAttendees ? sanitizeNumber(maxAttendees, 0, 1000) : null;
      const sanitizedType = ['meeting', 'event', 'activity', 'dugnad', 'internal', 'other'].includes(type) ? type : 'meeting';

      if (!sanitizedTitle || !date || !time) {
        return res.status(400).json({ error: 'Valid title, date, and time are required' });
      }

      const updatedEvent = await sql`
        UPDATE events
        SET title = ${sanitizedTitle},
            description = ${sanitizedDescription},
            date = ${date},
            time = ${time},
            location = ${sanitizedLocation},
            custom_location = ${sanitizedCustomLocation},
            max_attendees = ${sanitizedMaxAttendees},
            type = ${sanitizedType},
            vigilo_signup = ${vigiloSignup || false},
            no_signup = ${noSignup || false}
        WHERE id = ${id}
        RETURNING *
      `;

      if (updatedEvent.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      // Map database fields to frontend camelCase
      const mappedEvent = {
        ...updatedEvent[0],
        customLocation: updatedEvent[0].custom_location,
        maxAttendees: updatedEvent[0].max_attendees,
        currentAttendees: updatedEvent[0].current_attendees,
        vigiloSignup: updatedEvent[0].vigilo_signup,
        noSignup: updatedEvent[0].no_signup
      };

      return res.status(200).json(mappedEvent);
    }

    if (req.method === 'PATCH') {
      const { id, action } = req.query;

      if (action === 'cancel') {
        const cancelledEvent = await sql`
          UPDATE events
          SET status = 'cancelled'
          WHERE id = ${id}
          RETURNING *
        `;

        if (cancelledEvent.length === 0) {
          return res.status(404).json({ error: 'Event not found' });
        }

        return res.status(200).json(cancelledEvent[0]);
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

      // Check if event has registrations
      const registrations = await sql`
        SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ${id}
      `;

      if (registrations[0].count > 0) {
        return res.status(400).json({
          error: 'Cannot delete event with registrations',
          message: 'This event has registrations and cannot be deleted. You can cancel it instead.',
          hasRegistrations: true
        });
      }

      const deletedEvent = await sql`
        DELETE FROM events WHERE id = ${id} RETURNING id
      `;

      if (deletedEvent.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      return res.status(200).json({ success: true, message: 'Event deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    return handleError(res, error);
  }
}
