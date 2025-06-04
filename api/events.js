import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
    if (!dbUrl) {
      return res.status(500).json({ message: 'Database ikke konfigurert' });
    }

    const sql = neon(dbUrl);

    if (req.method === 'GET') {
      // Get all events
      const events = await sql`
        SELECT 
          id, title, description, date, time, location, custom_location,
          max_attendees, current_attendees, status, created_at
        FROM events 
        ORDER BY date ASC
      `;
      
      return res.json(events);
    }

    // For POST/PUT/DELETE, verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    const token = authHeader.substring(7);
    let decoded;
    
    try {
      decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      const tokenAge = Date.now() - decoded.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (!decoded.userId || !decoded.role || tokenAge >= maxAge) {
        return res.status(401).json({ message: 'Ikke innlogget' });
      }
    } catch (parseError) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    if (req.method === 'POST') {
      const { title, description, date, time, location, customLocation, maxAttendees } = req.body;
      
      if (!title || !description || !date || !time || !location) {
        return res.status(400).json({ message: 'Mangler påkrevde felter' });
      }

      const result = await sql`
        INSERT INTO events (
          title, description, date, time, location, custom_location, 
          max_attendees, current_attendees, status, created_at
        ) VALUES (
          ${title}, ${description}, ${date}, ${time}, ${location}, 
          ${customLocation || null}, ${maxAttendees || null}, 0, 'active', NOW()
        ) RETURNING *
      `;
      
      return res.json(result[0]);
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Events API error:', error);
    return res.status(500).json({ message: 'Serverfeil' });
  }
}