const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return res.status(500).json({ message: 'Database configuration missing' });
    }

    const { username, password, name, setupKey } = req.body;
    
    // Verify setup key for security
    if (setupKey !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({ message: 'Invalid setup key' });
    }

    if (!username || !password || !name) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const sql = neon(connectionString);

    // Check if admin already exists
    const existingAdmin = await sql`
      SELECT id FROM users WHERE role = 'admin'
    `;

    if (existingAdmin.length > 0) {
      return res.status(400).json({ message: 'Admin user already exists' });
    }

    // Create admin user
    const newAdmin = await sql`
      INSERT INTO users (username, password_hash, name, role)
      VALUES (${username}, ${password}, ${name}, 'admin')
      RETURNING id, username, name, role
    `;

    return res.status(201).json({
      message: 'Admin user created successfully',
      user: newAdmin[0]
    });
  } catch (error) {
    console.error('Admin setup error:', error);
    return res.status(500).json({ message: 'Setup failed' });
  }
};