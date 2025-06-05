import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Get all active events (public access)
    const events = await sql`
      SELECT 
        id, title, description, date, time, location, 
        custom_location as "customLocation",
        max_attendees as "maxAttendees", 
        current_attendees as "currentAttendees", 
        type, status
      FROM events 
      WHERE status = 'active'
      ORDER BY date ASC, time ASC
    `;

    return res.status(200).json(events);

  } catch (error) {
    console.error('Events API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}