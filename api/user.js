export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Validate token structure and expiry (24 hours)
      if (decoded.userId && decoded.username && decoded.role && decoded.timestamp) {
        const tokenAge = Date.now() - decoded.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (tokenAge < maxAge) {
          return res.json({
            userId: decoded.userId,
            username: decoded.username,
            name: decoded.name,
            role: decoded.role
          });
        }
      }
    } catch (parseError) {
      // Token is invalid
    }
    
    return res.status(401).json({ message: 'Ikke innlogget' });
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ message: 'Ikke innlogget' });
  }
}