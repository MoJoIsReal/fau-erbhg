import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // JWT authentication check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No valid authorization token provided' });
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'fallback-secret');
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (jwtError) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const documents = await sql`
        SELECT id, title, filename, file_url as "fileUrl", 
               file_size as "fileSize", mime_type as "mimeType",
               category, description, uploaded_at as "uploadedAt"
        FROM documents 
        ORDER BY uploaded_at DESC
      `;
      return res.status(200).json(documents);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'Valid document ID is required' });
      }
      
      try {
        const deletedDoc = await sql`
          DELETE FROM documents WHERE id = ${parseInt(id)} RETURNING file_url, filename
        `;
        
        if (deletedDoc.length === 0) {
          return res.status(404).json({ error: 'Document not found' });
        }

        return res.status(200).json({ 
          success: true, 
          message: 'Document deleted successfully' 
        });
      } catch (dbError) {
        console.error('Database deletion error:', dbError);
        return res.status(500).json({ error: 'Failed to delete document from database' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Documents API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}