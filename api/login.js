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
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Brukernavn og passord er påkrevd' });
    }

    // Use environment variable for database connection
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return res.status(500).json({ message: 'Database configuration missing' });
    }
    const sql = neon(connectionString);

    // Get user from database
    const users = await sql`
      SELECT id, username, password_hash, name, role 
      FROM users 
      WHERE username = ${username}
    `;

    if (users.length === 0) {
      return res.status(401).json({ message: 'Ugyldig brukernavn eller passord' });
    }

    const user = users[0];
    
    // Verify password against stored hash (simplified check for now)
    const isValidPassword = user.password_hash === password;
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Ugyldig brukernavn eller passord' });
    }

    // Create token
    const tokenData = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      timestamp: Date.now()
    };
    
    const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    return res.json({
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
    return res.status(500).json({ message: 'Serverfeil ved innlogging' });
  }
};