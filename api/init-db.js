import { db } from '../server/db.js';
import { storage } from '../server/storage.js';
import { hashPassword } from '../server/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Test database connection
    const testQuery = await db.execute('SELECT 1 as test');
    console.log('Database connection successful:', testQuery);

    // Check if admin user already exists
    const existingAdmin = await storage.getUserByUsername('admin');
    
    if (existingAdmin) {
      return res.status(200).json({ 
        message: 'Database already initialized',
        adminExists: true
      });
    }

    // Create admin user
    const hashedPassword = await hashPassword('admin123');
    const adminUser = await storage.createUser({
      username: 'admin',
      name: 'System Administrator',
      email: 'admin@fau-erdal.no',
      password: hashedPassword,
      role: 'admin'
    });

    console.log('Admin user created:', adminUser);
    
    res.status(200).json({ 
      message: 'Database initialized successfully',
      adminUser: {
        username: 'admin',
        password: 'admin123',
        note: 'Please change this password after first login'
      }
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({ 
      message: 'Database initialization failed',
      error: error.message 
    });
  }
}