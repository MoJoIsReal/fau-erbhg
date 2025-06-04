import { storage } from '../../server/storage.js';

function getSessionFromCookie(req) {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  
  const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('session='));
  if (!sessionCookie) return null;
  
  try {
    return JSON.parse(decodeURIComponent(sessionCookie.split('=')[1]));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = getSessionFromCookie(req);
    
    if (!session || !session.userId) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    const user = await storage.getUser(session.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'Bruker ikke funnet' });
    }

    res.status(200).json({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    });
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ message: 'Intern serverfeil' });
  }
}