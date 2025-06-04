import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    // Test database connection and query users
    const result = await sql`SELECT username, name, role FROM users WHERE role = 'admin'`;
    
    res.json({
      success: true,
      database_url_exists: !!process.env.DATABASE_URL,
      session_secret_exists: !!process.env.SESSION_SECRET,
      admin_users: result
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