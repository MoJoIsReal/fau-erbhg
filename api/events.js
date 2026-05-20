import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  requireCsrf,
  requireRole,
  sanitizeText,
  sanitizeHtml,
  sanitizeNumber
} from './_shared/middleware.js';
import { COUNCIL_ROLES, EVENT_TYPES } from '../shared/constants.js';

// All event endpoints return rows with the same camelCase shape so the
// client (and any cache merge) sees one schema. The same column list
// appears in every SELECT below — keep them in sync if columns change.

function normalizeRegistrationDeadline(value) {
  if (!value) return null;
  const deadline = new Date(String(value));
  if (Number.isNaN(deadline.getTime())) {
    return undefined;
  }
  return deadline.toISOString();
}

export default async function handler(req, res) {
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  try {
    const sql = getDb();

    if (req.method === 'GET') {
      const events = await sql`
        SELECT
          id, title, description, date, time, location,
          custom_location AS "customLocation",
          max_attendees AS "maxAttendees",
          current_attendees AS "currentAttendees",
          registration_deadline AS "registrationDeadline",
          type, status,
          vigilo_signup AS "vigiloSignup",
          no_signup AS "noSignup"
        FROM events
        WHERE status IN ('active', 'cancelled')
        ORDER BY date ASC, time ASC
      `;

      return res.status(200).json(events);
    }

    // All other methods require a council member.
    const user = requireRole(req, res, COUNCIL_ROLES);
    if (!user) return;

    if (!requireCsrf(req, res)) return;

    if (req.method === 'POST') {
      const {
        title,
        description,
        date,
        time,
        location,
        customLocation,
        maxAttendees,
        registrationDeadline,
        type,
        vigiloSignup,
        noSignup,
      } = req.body;

      const sanitizedTitle = sanitizeText(title, 200);
      const sanitizedDescription = sanitizeHtml(description, 5000);
      const sanitizedLocation = sanitizeText(location, 200);
      const sanitizedCustomLocation = customLocation ? sanitizeText(customLocation, 200) : null;
      const sanitizedMaxAttendees = maxAttendees ? sanitizeNumber(maxAttendees, 0, 1000) : null;
      const sanitizedRegistrationDeadline = normalizeRegistrationDeadline(registrationDeadline);

      if (!sanitizedTitle || !date || !time) {
        return res.status(400).json({ error: 'Valid title, date, and time are required' });
      }

      if (sanitizedRegistrationDeadline === undefined) {
        return res.status(400).json({ error: 'Valid registration deadline is required' });
      }

      if (!EVENT_TYPES.includes(type)) {
        return res.status(400).json({ error: `Invalid event type: ${type}`, allowed: EVENT_TYPES });
      }

      const inserted = await sql`
        WITH inserted AS (
          INSERT INTO events (title, description, date, time, location, custom_location, max_attendees, registration_deadline, type, vigilo_signup, no_signup)
          VALUES (${sanitizedTitle}, ${sanitizedDescription}, ${date}, ${time}, ${sanitizedLocation}, ${sanitizedCustomLocation}, ${sanitizedMaxAttendees}, ${sanitizedRegistrationDeadline}, ${type}, ${vigiloSignup || false}, ${noSignup || false})
          RETURNING *
        )
        SELECT
          id, title, description, date, time, location,
          custom_location AS "customLocation",
          max_attendees AS "maxAttendees",
          current_attendees AS "currentAttendees",
          registration_deadline AS "registrationDeadline",
          type, status,
          vigilo_signup AS "vigiloSignup",
          no_signup AS "noSignup"
        FROM inserted
      `;

      return res.status(201).json(inserted[0]);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      const {
        title,
        description,
        date,
        time,
        location,
        customLocation,
        maxAttendees,
        registrationDeadline,
        type,
        vigiloSignup,
        noSignup,
      } = req.body;

      const sanitizedTitle = sanitizeText(title, 200);
      const sanitizedDescription = sanitizeHtml(description, 5000);
      const sanitizedLocation = sanitizeText(location, 200);
      const sanitizedCustomLocation = customLocation ? sanitizeText(customLocation, 200) : null;
      const sanitizedMaxAttendees = maxAttendees ? sanitizeNumber(maxAttendees, 0, 1000) : null;
      const sanitizedRegistrationDeadline = normalizeRegistrationDeadline(registrationDeadline);

      if (!sanitizedTitle || !date || !time) {
        return res.status(400).json({ error: 'Valid title, date, and time are required' });
      }

      if (sanitizedRegistrationDeadline === undefined) {
        return res.status(400).json({ error: 'Valid registration deadline is required' });
      }

      if (!EVENT_TYPES.includes(type)) {
        return res.status(400).json({ error: `Invalid event type: ${type}`, allowed: EVENT_TYPES });
      }

      const updated = await sql`
        WITH updated AS (
          UPDATE events
          SET title = ${sanitizedTitle},
              description = ${sanitizedDescription},
              date = ${date},
              time = ${time},
              location = ${sanitizedLocation},
              custom_location = ${sanitizedCustomLocation},
              max_attendees = ${sanitizedMaxAttendees},
              registration_deadline = ${sanitizedRegistrationDeadline},
              type = ${type},
              vigilo_signup = ${vigiloSignup || false},
              no_signup = ${noSignup || false}
          WHERE id = ${id}
          RETURNING *
        )
        SELECT
          id, title, description, date, time, location,
          custom_location AS "customLocation",
          max_attendees AS "maxAttendees",
          current_attendees AS "currentAttendees",
          registration_deadline AS "registrationDeadline",
          type, status,
          vigilo_signup AS "vigiloSignup",
          no_signup AS "noSignup"
        FROM updated
      `;

      if (updated.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      return res.status(200).json(updated[0]);
    }

    if (req.method === 'PATCH') {
      const { id, action } = req.query;

      if (action === 'cancel') {
        const cancelled = await sql`
          WITH updated AS (
            UPDATE events
            SET status = 'cancelled'
            WHERE id = ${id}
            RETURNING *
          )
          SELECT
            id, title, description, date, time, location,
            custom_location AS "customLocation",
            max_attendees AS "maxAttendees",
            current_attendees AS "currentAttendees",
            registration_deadline AS "registrationDeadline",
            type, status,
            vigilo_signup AS "vigiloSignup",
            no_signup AS "noSignup"
          FROM updated
        `;

        if (cancelled.length === 0) {
          return res.status(404).json({ error: 'Event not found' });
        }

        return res.status(200).json(cancelled[0]);
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

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
