import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Use direct connection string from Neon
    const connectionString = "postgres://neondb_owner:npg_P5nSRsy4FYHq@ep-rapid-moon-a202ppv3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    const sql = neon(connectionString);

    // Test database connection
    const result = await sql`SELECT current_timestamp as server_time, version() as db_version`;
    
    // Test that tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    // Count records in main tables
    const userCount = await sql`SELECT COUNT(*) as count FROM users`;
    const eventCount = await sql`SELECT COUNT(*) as count FROM events`;
    const docCount = await sql`SELECT COUNT(*) as count FROM documents`;

    return res.status(200).json({
      status: 'success',
      message: 'Database connection working',
      data: {
        server_time: result[0].server_time,
        db_version: result[0].db_version.split(' ')[0],
        tables: tables.map(t => t.table_name),
        record_counts: {
          users: parseInt(userCount[0].count),
          events: parseInt(eventCount[0].count),
          documents: parseInt(docCount[0].count)
        }
      }
    });
  } catch (error) {
    console.error('Database test error:', error);
    return res.status(500).json({ 
      status: 'error',
      message: 'Database connection failed',
      error: error.message 
    });
  }
}