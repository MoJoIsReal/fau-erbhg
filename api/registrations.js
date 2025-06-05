import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const { eventId } = req.query;
      
      if (!eventId || isNaN(parseInt(eventId))) {
        return res.status(400).json({ error: 'Valid event ID required' });
      }

      const eventIdNum = parseInt(eventId);
      
      // Get registrations for an event
      const registrations = await sql`
        SELECT id, name, email, phone, attendee_count, comments, language
        FROM event_registrations 
        WHERE event_id = ${eventIdNum}
        ORDER BY id DESC
      `;

      return res.status(200).json(registrations);
    }

    if (req.method === 'POST') {
      // Create new registration
      const { eventId, name, email, phone, attendeeCount, comments, language } = req.body;

      if (!eventId || !name || !email) {
        return res.status(400).json({ error: 'Event ID, name and email are required' });
      }

      const eventIdNum = parseInt(eventId);
      
      if (isNaN(eventIdNum)) {
        return res.status(400).json({ error: 'Valid event ID required' });
      }

      // Check if event exists and is active
      const events = await sql`
        SELECT id, title, max_attendees, current_attendees 
        FROM events 
        WHERE id = ${eventIdNum} AND status = 'active'
      `;

      if (events.length === 0) {
        return res.status(404).json({ error: 'Event not found or not active' });
      }

      const event = events[0];
      const requestedAttendees = attendeeCount || 1;

      // Check capacity
      if (event.max_attendees && 
          (event.current_attendees + requestedAttendees) > event.max_attendees) {
        return res.status(400).json({ 
          error: 'Event is at capacity',
          available: event.max_attendees - event.current_attendees
        });
      }

      // Create registration
      const newRegistration = await sql`
        INSERT INTO event_registrations (
          event_id, name, email, phone, attendee_count, comments, language
        ) VALUES (
          ${eventIdNum}, ${name}, ${email}, ${phone || null}, 
          ${requestedAttendees}, ${comments || null}, ${language || 'no'}
        )
        RETURNING *
      `;

      // Update event attendee count
      await sql`
        UPDATE events 
        SET current_attendees = current_attendees + ${requestedAttendees}
        WHERE id = ${eventIdNum}
      `;

      return res.status(201).json(newRegistration[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Registrations API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}