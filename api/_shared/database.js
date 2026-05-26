import { neon } from '@neondatabase/serverless';

/**
 * Database connection utilities for Vercel serverless functions
 * Implements connection caching to improve performance
 * (Neon's fetch connection cache is on by default since 0.10.0.)
 */

// Cache the database client across function invocations
let cachedSql = null;

/**
 * Get or create a cached database connection
 * @returns {Function} - Neon SQL client
 */
export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Return cached connection if available
  if (cachedSql) {
    return cachedSql;
  }

  // Create and cache new connection
  cachedSql = neon(process.env.DATABASE_URL);
  return cachedSql;
}
