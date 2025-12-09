import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    checks: {
      database: 'unknown',
      env_vars: 'unknown'
    }
  };

  try {
    // Check required environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'SESSION_SECRET',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
      'ADMIN_SETUP_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      checks.checks.env_vars = 'error';
      checks.status = 'degraded';
      checks.missing_env_vars = missingVars;
    } else {
      checks.checks.env_vars = 'ok';
    }

    // Check database connection
    if (process.env.DATABASE_URL) {
      try {
        const sql = neon(process.env.DATABASE_URL);
        await sql`SELECT 1 as health_check`;
        checks.checks.database = 'ok';
      } catch (dbError) {
        checks.checks.database = 'error';
        checks.status = 'error';
        checks.database_error = dbError.message;
      }
    } else {
      checks.checks.database = 'error';
      checks.status = 'error';
    }

    const statusCode = checks.status === 'ok' ? 200 : checks.status === 'degraded' ? 200 : 503;
    return res.status(statusCode).json(checks);

  } catch (error) {
    return res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}
