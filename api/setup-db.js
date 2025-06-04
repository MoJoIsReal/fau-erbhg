export default async function handler(req, res) {
  try {
    // Use the exact connection string from Neon
    const connectionString = "postgres://neondb_owner:npg_P5nSRsy4FYHq@ep-rapid-moon-a202ppv3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    
    // Remove dynamic import that causes serverless issues
    // This endpoint is disabled for serverless deployment
    const pool = new Pool({ connectionString });
    
    // Initialize database tables
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

    // Create admin user
    const adminCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      ['fauerdalbarnehage@gmail.com']
    );

    if (adminCheck.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4)',
        ['fauerdalbarnehage@gmail.com', 'admin123', 'FAU Erdal Barnehage', 'admin']
      );
    }

    await pool.end();

    return res.json({
      success: true,
      message: 'Database initialized successfully',
      tables: ['users', 'events', 'event_registrations', 'documents', 'contact_messages']
    });

  } catch (error) {
    console.error('Database setup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}