import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check JWT authentication for non-GET requests
  if (req.method !== 'GET') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization token provided' });
    }

    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'fallback-secret');
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
               max_attendees, current_attendees, type, status, vigilo_signup
        FROM events 
        WHERE status IN ('active', 'cancelled')
        ORDER BY date ASC, time ASC
      `;
      return res.status(200).json(events);
    }

    if (req.method === 'POST') {
      const { title, description, date, time, location, custom_location, max_attendees } = req.body;

      if (!title || !date || !time) {
        return res.status(400).json({ error: 'Title, date, and time are required' });
      }

      const newEvent = await sql`
        INSERT INTO events (title, description, date, time, location, custom_location, max_attendees)
        VALUES (${title}, ${description}, ${date}, ${time}, ${location}, ${custom_location}, ${max_attendees})
        RETURNING *
      `;

      return res.status(201).json(newEvent[0]);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      const { title, description, date, time, location, customLocation, maxAttendees, type, vigiloSignup } = req.body;

      if (!title || !date || !time) {
        return res.status(400).json({ error: 'Title, date, and time are required' });
      }

      const updatedEvent = await sql`
        UPDATE events 
        SET title = ${title},
            description = ${description},
            date = ${date},
            time = ${time},
            location = ${location},
            custom_location = ${customLocation || null},
            max_attendees = ${maxAttendees || null},
            type = ${type || 'meeting'},
            vigilo_signup = ${vigiloSignup || false}
        WHERE id = ${id}
        RETURNING *
      `;

      if (updatedEvent.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      return res.status(200).json(updatedEvent[0]);
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