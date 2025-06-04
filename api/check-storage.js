export default async function handler(req, res) {
  try {
    // Check if Vercel provides storage through different methods
    const vercelEnv = process.env.VERCEL;
    const vercelUrl = process.env.VERCEL_URL;
    const vercelRegion = process.env.VERCEL_REGION;
    
    // Try to access Vercel's storage configuration
    let storageInfo = {};
    
    // Check for any Vercel-provided database environment variables
    const allEnvVars = Object.keys(process.env);
    const potentialDbVars = allEnvVars.filter(key => 
      key.includes('POSTGRES') || 
      key.includes('DATABASE') || 
      key.includes('NEON') ||
      key.includes('DB_') ||
      key.startsWith('PG')
    );

    // Check if there are any variables we might have missed
    const suspiciousVars = allEnvVars.filter(key => 
      key.includes('URL') && (
        key.includes('POOL') || 
        key.includes('CONNECT') ||
        key.includes('SQL')
      )
    );

    return res.json({
      vercel_info: {
        is_vercel: !!vercelEnv,
        url: vercelUrl,
        region: vercelRegion
      },
      potential_db_vars: potentialDbVars,
      suspicious_vars: suspiciousVars,
      total_env_count: allEnvVars.length,
      sample_vars: allEnvVars.slice(0, 15)
    });

  } catch (error) {
    return res.status(500).json({ 
      error: error.message 
    });
  }
}