import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Get document from database
    const documents = await sql`
      SELECT id, title, filename, cloudinary_url, mime_type 
      FROM documents 
      WHERE id = ${id}
    `;

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documents[0];

    if (!document.cloudinary_url) {
      return res.status(404).json({ error: 'File URL not found' });
    }

    // Redirect to Cloudinary URL for direct download
    return res.redirect(302, document.cloudinary_url);

  } catch (error) {
    console.error('Download API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}