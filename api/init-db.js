export default async function handler(req, res) {
  try {
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    
    if (!dbUrl) {
      return res.status(500).json({ message: 'Database URL not configured' });
    }

    // Import Neon database client
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString: dbUrl });
    
    try {
      // Create tables if they don't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'member',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          date DATE NOT NULL,
          time VARCHAR(10) NOT NULL,
          location VARCHAR(255) NOT NULL,
          custom_location VARCHAR(255),
          type VARCHAR(100) NOT NULL,
          max_attendees INTEGER,
          current_attendees INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'active',
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS event_registrations (
          id SERIAL PRIMARY KEY,
          event_id INTEGER REFERENCES events(id),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          attendees INTEGER DEFAULT 1,
          comments TEXT,
          registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(100) NOT NULL,
          file_url VARCHAR(500) NOT NULL,
          file_size INTEGER,
          uploaded_by VARCHAR(255) NOT NULL,
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_messages (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          subject VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          is_anonymous BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert admin user if not exists
      const adminResult = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        ['fauerdalbarnehage@gmail.com']
      );

      if (adminResult.rows.length === 0) {
        await pool.query(
          'INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4)',
          ['fauerdalbarnehage@gmail.com', 'admin123', 'FAU Erdal Barnehage', 'admin']
        );
      }

      await pool.end();

      return res.json({ 
        message: 'Database initialized successfully',
        tables_created: ['users', 'events', 'event_registrations', 'documents', 'contact_messages']
      });

    } catch (dbError) {
      await pool.end();
      throw dbError;
    }

  } catch (error) {
    console.error('Database initialization error:', error);
    return res.status(500).json({ 
      message: 'Database initialization failed',
      error: error.message
    });
  }
}