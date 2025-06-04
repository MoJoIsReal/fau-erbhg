import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export default async function handler(req, res) {
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // Test database connection and query users
    const result = await pool.query('SELECT username, name, role FROM users WHERE role = $1', ['admin']);
    
    res.json({
      success: true,
      database_url_exists: !!process.env.DATABASE_URL,
      session_secret_exists: !!process.env.SESSION_SECRET,
      admin_users: result.rows
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      database_url_exists: !!process.env.DATABASE_URL,
      session_secret_exists: !!process.env.SESSION_SECRET
    });
  }
}