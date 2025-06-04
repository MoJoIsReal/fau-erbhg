export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { username, password } = req.body;
      
      // Simple hardcoded authentication for testing
      if (username === 'fauerdalbarnehage@gmail.com' && password === 'admin123') {
        // Create a simple token (not JWT for now to avoid import issues)
        const token = Buffer.from(JSON.stringify({
          userId: 1,
          username: 'fauerdalbarnehage@gmail.com',
          name: 'FAU Erdal Barnehage',
          role: 'admin',
          timestamp: Date.now()
        })).toString('base64');

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
      return res.status(500).json({ message: 'Serverfeil ved innlogging' });
    }
  }

  if (req.method === 'GET') {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Ikke innlogget' });
      }

      const token = authHeader.substring(7);
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Simple validation
      if (decoded.userId && decoded.username && decoded.role) {
        return res.json({
          userId: decoded.userId,
          username: decoded.username,
          name: decoded.name,
          role: decoded.role
        });
      } else {
        return res.status(401).json({ message: 'Ikke innlogget' });
      }
    } catch (error) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}