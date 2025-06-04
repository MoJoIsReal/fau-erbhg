import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../server/db.js';
import { users } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Brukernavn og passord er påkrevd' });
    }

    // Find user by username
    const [user] = await db.select().from(users).where(eq(users.username, username));
    
    if (!user) {
      return res.status(401).json({ message: 'Ugyldig brukernavn eller passord' });
    }

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