import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.SESSION_SECRET || 'fallback-dev-secret';
    const decoded = jwt.verify(token, jwtSecret);
    
    res.json({
      userId: decoded.userId,
      username: decoded.username,
      name: decoded.name,
      role: decoded.role
    });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(401).json({ message: 'Ikke innlogget' });
  }
}