export default async function handler(req, res) {
  try {
    // Try the exact connection string you provided
    const connectionString = "postgresql://neondb_owner:npg_P5nSRsy4FYHq@ep-rapid-moon-a202ppv3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString });
    
    // Test basic connection
    const result = await pool.query('SELECT NOW() as current_time');
    await pool.end();
    
    return res.json({
      status: 'success',
      message: 'Direct database connection successful',
      timestamp: result.rows[0].current_time
    });
    
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error.message
    });
  }
}