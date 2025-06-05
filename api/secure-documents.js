import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const { category } = req.query;

      let query;
      if (category) {
        query = sql`
          SELECT id, title, category, file_url, uploaded_at
          FROM documents 
          WHERE category = ${category}
          ORDER BY uploaded_at DESC
        `;
      } else {
        query = sql`
          SELECT id, title, category, file_url, uploaded_at
          FROM documents 
          ORDER BY uploaded_at DESC
        `;
      }

      const documents = await query;
      return res.status(200).json(documents);
    }

    if (req.method === 'POST') {
      const { title, category, fileUrl } = req.body;

      if (!title || !category || !fileUrl) {
        return res.status(400).json({ error: 'Title, category, and file URL are required' });
      }

      const newDocument = await sql`
        INSERT INTO documents (title, category, file_url)
        VALUES (${title}, ${category}, ${fileUrl})
        RETURNING *
      `;

      return res.status(201).json({
        success: true,
        document: newDocument[0],
        message: 'Document uploaded successfully'
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Document ID required' });
      }

      const deletedDocument = await sql`
        DELETE FROM documents WHERE id = ${id} RETURNING id, file_url
      `;

      if (deletedDocument.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Documents API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}