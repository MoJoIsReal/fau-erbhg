import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // Security headers
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://fau-erdal-barnehage.vercel.app']
    : ['http://localhost:5000', 'http://localhost:3000', 'http://127.0.0.1:5000'];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // JWT authentication check
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

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const { eventId, id } = req.query;

    if (req.method === 'GET' && eventId) {
      const registrations = await sql`
        SELECT id, event_id as "eventId", name, email, phone, 
               attendee_count as "attendeeCount", comments, 
               registered_at as "registeredAt"
        FROM event_registrations 
        WHERE event_id = ${eventId}
        ORDER BY registered_at DESC
      `;
      return res.status(200).json(registrations);
    }

    if (req.method === 'DELETE' && id) {
      const deletedReg = await sql`
        DELETE FROM event_registrations WHERE id = ${id} RETURNING event_id, attendee_count
      `;

      if (deletedReg.length === 0) {
        return res.status(404).json({ error: 'Registration not found' });
      }

      // Update event attendee count
      const { event_id, attendee_count } = deletedReg[0];
      await sql`
        UPDATE events 
        SET current_attendees = GREATEST(0, current_attendees - ${attendee_count || 1})
        WHERE id = ${event_id}
      `;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Registrations API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}