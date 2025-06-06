import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
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

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const { id } = req.query;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Valid registration ID required' });
    }

    const registrationId = parseInt(id);

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

  } catch (error) {
    console.error('Registration deletion error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}