import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
} from './_shared/middleware.js';

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

export default async function handler(req, res) {
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const checks = {
    database: 'unknown',
    env_vars: 'unknown',
  };

  const missingEnv = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  checks.env_vars = missingEnv.length === 0 ? 'ok' : 'missing';

  try {
    const sql = getDb();
    await sql`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  const status = checks.database === 'ok' && checks.env_vars === 'ok' ? 'ok' : 'degraded';
  const httpStatus = status === 'ok' ? 200 : 503;

  return res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    checks,
  });
}
