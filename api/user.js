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

  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    if (!process.env.SESSION_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);
    
    // Get user data
    const users = await sql`
      SELECT id, username, name, role 
      FROM users 
      WHERE id = ${decoded.userId}
    `;

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    return res.status(200).json({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    });

  } catch (error) {
    console.error('User auth error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}