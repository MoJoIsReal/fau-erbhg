module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    status: 'working',
    timestamp: new Date().toISOString(),
    message: 'CommonJS serverless function is operational',
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      hasDatabase: !!process.env.DATABASE_URL
    }
  });
};