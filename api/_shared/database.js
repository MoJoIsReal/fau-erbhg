import { neon, neonConfig } from '@neondatabase/serverless';

/**
 * Database connection utilities for Vercel serverless functions
 * Implements connection caching to improve performance
 */

// Enable connection caching for better performance
neonConfig.fetchConnectionCache = true;

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

/**
 * Execute a database query with error handling
 * @param {Function} queryFn - Function that executes the query
 * @returns {Promise} - Query result
 */
export async function executeQuery(queryFn) {
  try {
    const sql = getDb();
    return await queryFn(sql);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Clear the cached database connection
 * Useful for testing or when connection needs to be refreshed
 */
export function clearDbCache() {
  cachedSql = null;
}
