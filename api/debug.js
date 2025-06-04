export default async function handler(req, res) {
  try {
    // Check all environment variables that might contain database info
    const allEnvKeys = Object.keys(process.env);
    const dbKeys = allEnvKeys.filter(key => 
      key.toLowerCase().includes('postgres') || 
      key.toLowerCase().includes('database') || 
      key.toLowerCase().includes('neon') ||
      key.toLowerCase().includes('db') ||
      key.startsWith('PG')
    );

    // Check for Vercel-specific environment patterns
    const vercelKeys = allEnvKeys.filter(key => 
      key.startsWith('VERCEL_') || 
      key.startsWith('NX_') ||
      key.includes('STORAGE')
    );

    return res.json({
      status: 'Complete environment check',
      total_env_vars: allEnvKeys.length,
      database_keys: dbKeys,
      vercel_keys: vercelKeys.slice(0, 10), // First 10 to avoid too much output
      sample_env_keys: allEnvKeys.slice(0, 20), // First 20 keys for debugging
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