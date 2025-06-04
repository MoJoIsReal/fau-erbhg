const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Use direct connection string from Neon
    const connectionString = "postgres://neondb_owner:npg_P5nSRsy4FYHq@ep-rapid-moon-a202ppv3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    const sql = neon(connectionString);

    if (req.method === 'GET') {
      // Get all documents (public access for viewing)
      const documents = await sql`
        SELECT id, title, category, file_url, uploaded_at
        FROM documents 
        ORDER BY uploaded_at DESC
      `;

      return res.status(200).json(documents);
    }

    if (req.method === 'POST') {
      const { title, category, fileUrl } = req.body;
      
      if (!title || !category || !fileUrl) {
        return res.status(400).json({ message: 'Tittel, kategori og fil-URL er påkrevd' });
      }

      const newDocument = await sql`
        INSERT INTO documents (title, category, file_url)
        VALUES (${title}, ${category}, ${fileUrl})
        RETURNING *
      `;

      return res.status(201).json(newDocument[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ message: 'Dokument-ID er påkrevd' });
      }

      await sql`DELETE FROM documents WHERE id = ${id}`;
      return res.status(200).json({ message: 'Dokument slettet' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Documents API error:', error);
    return res.status(500).json({ message: 'Serverfeil' });
  }
};