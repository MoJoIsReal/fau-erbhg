import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
      // Get all documents (public access)
      const documents = await sql`
        SELECT 
          id, title, filename, file_url as "fileUrl", 
          file_size as "fileSize", mime_type as "mimeType",
          category, description, uploaded_at as "uploadedAt"
        FROM documents 
        ORDER BY uploaded_at DESC
      `;

      return res.status(200).json(documents);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Documents API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}