const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
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

    if (req.method === 'GET') {
      // Get all events
      const events = await sql`
        SELECT id, title, description, date, time, location, custom_location, 
               max_attendees, current_attendees, status, created_at
        FROM events 
        WHERE status = 'active'
        ORDER BY date ASC, time ASC
      `;

      return res.status(200).json(events);
    }

    if (req.method === 'POST') {
      const { title, description, date, time, location, customLocation, maxAttendees } = req.body;
      
      if (!title || !date || !time || !location) {
        return res.status(400).json({ message: 'Tittel, dato, tid og sted er påkrevd' });
      }

      const newEvent = await sql`
        INSERT INTO events (title, description, date, time, location, custom_location, max_attendees)
        VALUES (${title}, ${description}, ${date}, ${time}, ${location}, ${customLocation}, ${maxAttendees})
        RETURNING *
      `;

      return res.status(201).json(newEvent[0]);
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Events API error:', error);
    return res.status(500).json({ message: 'Serverfeil' });
  }
};