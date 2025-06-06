import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // JWT authentication check
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

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const { eventId, id } = req.query;
    
    // Extract ID from URL path for DELETE requests (e.g., /api/secure-registrations/12)
    const pathSegments = req.url.split('/');
    const urlId = pathSegments[pathSegments.length - 1];
    const registrationId = id || (urlId && !isNaN(parseInt(urlId)) ? urlId : null);

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

    if (req.method === 'DELETE' && registrationId) {
      const deletedReg = await sql`
        DELETE FROM event_registrations WHERE id = ${registrationId} RETURNING event_id, attendee_count
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