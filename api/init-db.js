import { initializeDatabase } from '../server/init-database.js';
import { initializeAdmin } from '../server/init-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Initialize database tables
    await initializeDatabase();
    
    // Initialize admin user
    await initializeAdmin();
    
    res.status(200).json({ 
      message: 'Database initialized successfully',
      adminUser: 'Check server logs for admin credentials'
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({ 
      message: 'Database initialization failed',
      error: error.message 
    });
  }
}