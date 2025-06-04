export default async function handler(req, res) {
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

    // For now, use hardcoded admin credentials until we resolve the database connection
    if (username === 'fauerdalbarnehage@gmail.com' && password === 'admin123') {
      // Create a simple base64 token
      const tokenData = {
        userId: 1,
        username: 'fauerdalbarnehage@gmail.com',
        name: 'FAU Erdal Barnehage',
        role: 'admin',
        timestamp: Date.now()
      };
      
      const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

      return res.json({
        message: 'Innlogging vellykket',
        token,
        user: {
          id: 1,
          username: 'fauerdalbarnehage@gmail.com',
          name: 'FAU Erdal Barnehage',
          role: 'admin'
        }
      });
    } else {
      return res.status(401).json({ message: 'Ugyldig brukernavn eller passord' });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Serverfeil ved innlogging' });
  }
}