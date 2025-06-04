export default async function handler(req, res) {
  try {
    const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    if (!dbUrl) {
      return res.json({ 
        error: 'No database URL found',
        env_vars: {
          POSTGRES_URL: !!process.env.POSTGRES_URL,
          DATABASE_URL: !!process.env.DATABASE_URL
        }
      });
    }

    // Try to connect to the database
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString: dbUrl });
    
    // Test simple query
    const result = await pool.query('SELECT NOW() as current_time');
    await pool.end();
    
    return res.json({ 
      status: 'Database connection successful',
      timestamp: result.rows[0].current_time
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Database connection failed',
      message: error.message,
      stack: error.stack?.substring(0, 500)
    });
  }
}