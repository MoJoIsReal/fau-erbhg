import { authenticateUser } from '../../server/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Brukernavn og passord er påkrevd' });
    }

    const user = await authenticateUser(username, password);
    
    if (!user) {
      return res.status(401).json({ message: 'Ugyldig brukernavn eller passord' });
    }

    const sessionData = {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };

    res.setHeader('Set-Cookie', `session=${JSON.stringify(sessionData)}; HttpOnly; Path=/; Max-Age=86400`);
    
    res.status(200).json({
      message: 'Innlogging vellykket',
      user: sessionData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Intern serverfeil' });
  }
}