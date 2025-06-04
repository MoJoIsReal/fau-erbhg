export default async function handler(req, res) {
  try {
    // Check all possible environment variables
    const allEnvVars = Object.keys(process.env).filter(key => 
      key.includes('POSTGRES') || 
      key.includes('DATABASE') || 
      key.includes('NEON') ||
      key.includes('PG')
    );

    const envStatus = {};
    allEnvVars.forEach(key => {
      envStatus[key] = process.env[key] ? 'SET' : 'UNSET';
    });

    return res.json({
      status: 'Environment check',
      total_env_vars: Object.keys(process.env).length,
      database_related: allEnvVars,
      env_status: envStatus,
      vercel_env: !!process.env.VERCEL,
      node_env: process.env.NODE_ENV
    });

  } catch (error) {
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack?.substring(0, 200)
    });
  }
}