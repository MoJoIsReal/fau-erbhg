import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import { sanitizeText, sanitizeHtml, sanitizeNumber } from './_shared/middleware.js';

export default async function handler(req, res) {
  // Security headers
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://fau-erdal-barnehage.vercel.app']
    : ['http://localhost:5000', 'http://localhost:3000', 'http://127.0.0.1:5000'];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check JWT authentication for non-GET requests
  if (req.method !== 'GET') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization token provided' });
    }

    if (!process.env.SESSION_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.SESSION_SECRET);
      if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const events = await sql`
        SELECT id, title, description, date, time, location, custom_location,
               max_attendees, current_attendees, type, status, vigilo_signup, no_signup
        FROM events 
        WHERE status IN ('active', 'cancelled')
        ORDER BY date ASC, time ASC
      `;
      
      // Map database fields to frontend camelCase
      const mappedEvents = events.map(event => ({
        ...event,
        customLocation: event.custom_location,
        maxAttendees: event.max_attendees,
        currentAttendees: event.current_attendees,
        vigiloSignup: event.vigilo_signup,
        noSignup: event.no_signup
      }));
      
      return res.status(200).json(mappedEvents);
    }

    if (req.method === 'POST') {
      const { title, description, date, time, location, custom_location, max_attendees, type, vigiloSignup, noSignup } = req.body;

      // Sanitize inputs
      const sanitizedTitle = sanitizeText(title, 200);
      const sanitizedDescription = sanitizeHtml(description, 5000);
      const sanitizedLocation = sanitizeText(location, 200);
      const sanitizedCustomLocation = custom_location ? sanitizeText(custom_location, 200) : null;
      const sanitizedMaxAttendees = max_attendees ? sanitizeNumber(max_attendees, 0, 1000) : null;
      const sanitizedType = ['meeting', 'event', 'activity', 'other'].includes(type) ? type : 'meeting';

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
      const sanitizedType = ['meeting', 'event', 'activity', 'other'].includes(type) ? type : 'meeting';

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
    console.error('Events API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}