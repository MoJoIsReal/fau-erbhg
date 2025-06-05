import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
      // Get all active events
      const events = await sql`
        SELECT 
          id, title, description, date, time, location, custom_location,
          max_attendees, current_attendees, status, created_at
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