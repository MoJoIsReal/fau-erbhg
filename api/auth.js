export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Redirect all authentication requests to secure endpoint
  return res.status(302).json({
    message: 'Please use /api/secure-auth for authentication',
    redirect: '/api/secure-auth'
  });
}