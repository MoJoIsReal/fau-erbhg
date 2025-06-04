import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  try {
    // Check all possible database environment variable names
    const dbUrl = process.env.DATABASE_URL || 
                  process.env.POSTGRES_URL || 
                  process.env.POSTGRES_PRISMA_URL ||
                  process.env.NEON_DATABASE_URL;
    
    if (!dbUrl) {
      return res.json({
        success: false,
        error: 'No database URL found',
        env_vars: Object.keys(process.env).filter(key => 
          key.includes('DATABASE') || 
          key.includes('POSTGRES') || 
          key.includes('NEON')
        )
      });
    }

    const sql = neon(dbUrl);
    const result = await sql`SELECT username, name, role FROM users WHERE role = 'admin'`;
    
    res.json({
      success: true,
      database_url_exists: !!dbUrl,
      session_secret_exists: !!process.env.SESSION_SECRET,
      admin_users: result
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      database_url_exists: !!process.env.DATABASE_URL,
      session_secret_exists: !!process.env.SESSION_SECRET,
      env_vars: Object.keys(process.env).filter(key => 
        key.includes('DATABASE') || 
        key.includes('POSTGRES') || 
        key.includes('NEON')
      )
    });
  }
}