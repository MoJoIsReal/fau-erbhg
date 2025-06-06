import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  try {
    // CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check for database URL
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL environment variable is missing');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    // Initialize database connection
    const sql = neon(process.env.DATABASE_URL);

    // Fetch documents from database
    const documents = await sql`
      SELECT 
        id, 
        title, 
        filename, 
        cloudinary_url as "fileUrl", 
        file_size as "fileSize", 
        mime_type as "mimeType",
        category, 
        description, 
        uploaded_at as "uploadedAt"
      FROM documents 
      ORDER BY uploaded_at DESC
    `;

    // Return documents
    return res.status(200).json(documents);

  } catch (error) {
    console.error('Documents API error:', error);
    console.error('Error details:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}