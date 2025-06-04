module.exports = async (req, res) => {
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
    // Get token from Authorization header or cookies
    const authHeader = req.headers.authorization;
    const cookieToken = req.headers.cookie?.split(';')
      .find(c => c.trim().startsWith('auth-token='))
      ?.split('=')[1];

    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Decode token
    try {
      const tokenData = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Basic token validation
      if (!tokenData.userId || !tokenData.username) {
        return res.status(401).json({ message: 'Invalid token format' });
      }

      // Check if token is not too old (24 hours)
      const tokenAge = Date.now() - tokenData.timestamp;
      if (tokenAge > 24 * 60 * 60 * 1000) {
        return res.status(401).json({ message: 'Token expired' });
      }

      return res.status(200).json({
        id: tokenData.userId,
        username: tokenData.username,
        name: tokenData.name,
        role: tokenData.role
      });
    } catch (decodeError) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  } catch (error) {
    console.error('User API error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};