import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Brukernavn og passord er påkrevd' });
    }

    // Try different possible database URL environment variables
    const dbUrl = process.env.DATABASE_URL || 
                  process.env.POSTGRES_URL || 
                  process.env.POSTGRES_PRISMA_URL ||
                  process.env.NEON_DATABASE_URL;

    if (!dbUrl) {
      return res.status(500).json({ message: 'Database ikke konfigurert' });
    }

    const sql = neon(dbUrl);

    // Find user by username using Neon SQL
    const result = await sql`SELECT id, username, password, name, role FROM users WHERE username = ${username}`;
    
    if (result.length === 0) {
      return res.status(401).json({ message: 'Ugyldig brukernavn eller passord' });
    }

    const user = result[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Ugyldig brukernavn eller passord' });
    }

    // Create JWT token
    const jwtSecret = process.env.SESSION_SECRET || 'fallback-dev-secret';
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({ 
      message: 'Innlogging vellykket',
      token,
      user: { 
        id: user.id, 
        username: user.username, 
        name: user.name, 
        role: user.role 
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Serverfeil ved innlogging' });
  }
}