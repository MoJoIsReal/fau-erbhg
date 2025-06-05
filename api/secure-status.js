export default function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Environment validation
  const hasDatabase = !!process.env.DATABASE_URL;
  const hasSession = !!process.env.SESSION_SECRET;
  
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'FAU Erdal Barnehage API - Secure Version',
    version: '2.0.0',
    environment: {
      database_configured: hasDatabase,
      session_configured: hasSession,
      node_version: process.version
    }
  });
}