export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Test database connection using available environment variables
    const possibleDbUrls = [
      process.env.POSTGRES_URL,
      process.env.DATABASE_URL,
      process.env.POSTGRES_PRISMA_URL,
      process.env.POSTGRES_URL_NON_POOLING,
      process.env.NEON_DATABASE_URL
    ].filter(Boolean);

    return res.json({ 
      message: 'Database connection test',
      availableConnections: possibleDbUrls.length,
      hasConnection: possibleDbUrls.length > 0,
      primaryUrl: possibleDbUrls[0] ? 'Available' : 'Missing'
    });

  } catch (error) {
    console.error('Environment check error:', error);
    return res.status(500).json({ message: 'Environment check failed' });
  }
}