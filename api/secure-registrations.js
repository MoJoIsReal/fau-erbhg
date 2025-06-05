import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

      if (!eventId) {
        return res.status(400).json({ error: 'Event ID required' });
      }

      const registrations = await sql`
        SELECT id, event_id, name, email, phone, language, created_at
        FROM event_registrations 
        WHERE event_id = ${eventId}
        ORDER BY created_at DESC
      `;

      return res.status(200).json(registrations);
    }

    if (req.method === 'POST') {
      const { eventId, name, email, phone, language = 'no' } = req.body;

      if (!eventId || !name || !email) {
        return res.status(400).json({ error: 'Event ID, name, and email are required' });
      }

      // Check if event exists and has space
      const events = await sql`
        SELECT id, max_attendees, current_attendees, status
        FROM events 
        WHERE id = ${eventId} AND status = 'active'
      `;

      if (events.length === 0) {
        return res.status(404).json({ error: 'Event not found or inactive' });
      }

      const event = events[0];
      if (event.max_attendees && event.current_attendees >= event.max_attendees) {
        return res.status(400).json({ error: 'Event is full' });
      }

      // Create registration
      const newRegistration = await sql`
        INSERT INTO event_registrations (event_id, name, email, phone, language)
        VALUES (${eventId}, ${name}, ${email}, ${phone}, ${language})
        RETURNING *
      `;

      // Update current attendees count
      await sql`
        UPDATE events 
        SET current_attendees = current_attendees + 1
        WHERE id = ${eventId}
      `;

      // Send confirmation email
      try {
        const emailResponse = await fetch(`${req.headers.origin || 'http://localhost:5000'}/api/email-gmail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'event_confirmation',
            data: {
              registration: newRegistration[0],
              event: event,
              language: language
            }
          })
        });
        
        if (!emailResponse.ok) {
          console.warn('Failed to send confirmation email');
        }
      } catch (emailError) {
        console.warn('Email service unavailable:', emailError.message);
      }

      return res.status(201).json({
        success: true,
        registration: newRegistration[0],
        message: 'Registration successful'
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Registration ID required' });
      }

      // Get registration details before deletion
      const registrations = await sql`
        SELECT event_id FROM event_registrations WHERE id = ${id}
      `;

      if (registrations.length === 0) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      const eventId = registrations[0].event_id;

      // Delete registration
      await sql`DELETE FROM event_registrations WHERE id = ${id}`;

      // Update current attendees count
      await sql`
        UPDATE events 
        SET current_attendees = GREATEST(current_attendees - 1, 0)
        WHERE id = ${eventId}
      `;

      return res.status(200).json({
        success: true,
        message: 'Registration cancelled'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Registrations API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}