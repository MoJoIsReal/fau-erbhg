import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // Security headers
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://fau-erdal-barnehage.vercel.app']
    : ['http://localhost:5000', 'http://localhost:3000'];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      // Get all events including cancelled ones (public access)
      const events = await sql`
        SELECT 
          id, title, description, date, time, location, 
          custom_location as "customLocation",
          max_attendees as "maxAttendees", 
          current_attendees as "currentAttendees", 
          type, status, vigilo_signup as "vigiloSignup"
        FROM events 
        WHERE status IN ('active', 'cancelled')
        ORDER BY date ASC, time ASC
      `;

      return res.status(200).json(events);
    }

    if (req.method === 'POST') {
      // JWT authentication check
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.substring(7);
      const jwtSecret = process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-production';
      
      try {
        const decoded = jwt.verify(token, jwtSecret);
        
        // Check if user has permission to create events
        if (decoded.role !== 'admin' && decoded.role !== 'member') {
          return res.status(403).json({ error: 'Council member access required' });
        }
      } catch (jwtError) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Create new event
      const { title, description, date, time, location, customLocation, maxAttendees, type } = req.body;

      if (!title || !description || !date || !time || !location || !type) {
        return res.status(400).json({ error: 'Required fields missing' });
      }

      const newEvent = await sql`
        INSERT INTO events (title, description, date, time, location, custom_location, max_attendees, current_attendees, type, status)
        VALUES (${title}, ${description}, ${date}, ${time}, ${location}, ${customLocation || null}, ${maxAttendees || null}, 0, ${type}, 'active')
        RETURNING *
      `;

      return res.status(201).json(newEvent[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Events API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}