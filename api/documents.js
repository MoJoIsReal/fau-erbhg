import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
    if (!dbUrl) {
      return res.status(500).json({ message: 'Database ikke konfigurert' });
    }

    const sql = neon(dbUrl);

    if (req.method === 'GET') {
      // Get all documents (public access for viewing)
      const documents = await sql`
        SELECT id, title, category, file_url, uploaded_at 
        FROM documents 
        ORDER BY uploaded_at DESC
      `;
      
      return res.json(documents);
    }

    // For POST/DELETE, verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    const token = authHeader.substring(7);
    let decoded;
    
    try {
      decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      const tokenAge = Date.now() - decoded.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (!decoded.userId || !decoded.role || tokenAge >= maxAge) {
        return res.status(401).json({ message: 'Ikke innlogget' });
      }
      
      // Only admin can upload/delete documents
      if (decoded.role !== 'admin') {
        return res.status(403).json({ message: 'Ingen tilgang' });
      }
    } catch (parseError) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    if (req.method === 'POST') {
      const { title, category, fileUrl } = req.body;
      
      if (!title || !category || !fileUrl) {
        return res.status(400).json({ message: 'Mangler påkrevde felter' });
      }

      const result = await sql`
        INSERT INTO documents (title, category, file_url, uploaded_at)
        VALUES (${title}, ${category}, ${fileUrl}, NOW())
        RETURNING *
      `;
      
      return res.json(result[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ message: 'Dokument ID mangler' });
      }

      const result = await sql`
        DELETE FROM documents WHERE id = ${parseInt(id)}
        RETURNING *
      `;
      
      if (result.length === 0) {
        return res.status(404).json({ message: 'Dokument ikke funnet' });
      }
      
      return res.json({ message: 'Dokument slettet' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Documents API error:', error);
    return res.status(500).json({ message: 'Serverfeil' });
  }
}