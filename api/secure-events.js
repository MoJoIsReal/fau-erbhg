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
      // Get all active events
      const events = await sql`
        SELECT 
          id, title, description, date, time, location, custom_location,
          max_attendees, current_attendees, type, status
        FROM events 
        WHERE status = 'active'
        ORDER BY date ASC, time ASC
      `;

      return res.status(200).json(events);
    }

    if (req.method === 'POST') {
      // Create new event
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
      // Update event
      const { id } = req.query;
      const { title, description, date, time, location, custom_location, max_attendees, status } = req.body;

      const updatedEvent = await sql`
        UPDATE events 
        SET title = ${title}, description = ${description}, date = ${date}, time = ${time},
            location = ${location}, custom_location = ${custom_location}, 
            max_attendees = ${max_attendees}, status = ${status}
        WHERE id = ${id}
        RETURNING *
      `;

      if (updatedEvent.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      return res.status(200).json(updatedEvent[0]);
    }

    if (req.method === 'PATCH') {
      // Handle event actions (like cancellation)
      const { id, action } = req.query;

      if (action === 'cancel') {
        // Get all registrations for this event first
        const registrations = await sql`
          SELECT * FROM event_registrations WHERE event_id = ${id}
        `;

        // Cancel the event
        const cancelledEvent = await sql`
          UPDATE events 
          SET status = 'cancelled'
          WHERE id = ${id}
          RETURNING *
        `;

        if (cancelledEvent.length === 0) {
          return res.status(404).json({ error: 'Event not found' });
        }

        console.log('Event cancelled successfully:', cancelledEvent[0]);

        return res.status(200).json(cancelledEvent[0]);
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    if (req.method === 'DELETE') {
      // Delete event
      const { id } = req.query;

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