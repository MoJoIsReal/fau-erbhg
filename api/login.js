const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-serverless');
const { eq } = require('drizzle-orm');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

// Define users table schema inline for serverless
const { pgTable, serial, text, timestamp } = require('drizzle-orm/pg-core');

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow(),
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

module.exports = async function handler(req, res) {
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