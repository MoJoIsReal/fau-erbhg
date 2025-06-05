import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
      return res.status(500).json({ error: 'Server configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const { username, password, action } = req.body;

    if (action === 'login') {
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const users = await sql`
        SELECT id, username, password, name, role 
        FROM users 
        WHERE username = ${username}
      `;

      if (users.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = users[0];
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const tokenData = {
        userId: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        timestamp: Date.now(),
        expires: Date.now() + (24 * 60 * 60 * 1000)
      };

      const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        },
        token
      });
    }

    if (action === 'register') {
      const { name, setupKey } = req.body;

      if (!username || !password || !name) {
        return res.status(400).json({ error: 'All fields required' });
      }

      // Check if this is admin setup
      if (setupKey === process.env.ADMIN_SETUP_KEY) {
        const existingAdmin = await sql`
          SELECT id FROM users WHERE role = 'admin'
        `;

        if (existingAdmin.length > 0) {
          return res.status(400).json({ error: 'Admin already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newAdmin = await sql`
          INSERT INTO users (username, password_hash, name, role)
          VALUES (${username}, ${hashedPassword}, ${name}, 'admin')
          RETURNING id, username, name, role
        `;

        return res.status(201).json({
          success: true,
          message: 'Admin user created',
          user: newAdmin[0]
        });
      }

      return res.status(403).json({ error: 'Registration not allowed' });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}