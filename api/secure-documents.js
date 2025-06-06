import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  console.log('Secure documents API called:', req.method, req.url);
  
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
    if (!process.env.SESSION_SECRET) {
      console.error('SESSION_SECRET environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (jwtError) {
    console.error('JWT verification error:', jwtError.message);
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Handle board members endpoints
    if (req.url?.includes('board-members')) {
      return handleBoardMembers(req, res, sql);
    }

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
      console.log('DELETE request - ID received:', id, 'Type:', typeof id);
      
      if (!id || isNaN(parseInt(id))) {
        console.error('Invalid ID provided:', id);
        return res.status(400).json({ error: 'Valid document ID is required' });
      }
      
      const documentId = parseInt(id);
      console.log('Attempting to delete document with ID:', documentId);
      
      try {
        const deletedDoc = await sql`
          DELETE FROM documents WHERE id = ${documentId} RETURNING id, cloudinary_url, filename
        `;
        
        console.log('Database deletion result:', deletedDoc);
        
        if (deletedDoc.length === 0) {
          console.log('No document found with ID:', documentId);
          return res.status(404).json({ error: 'Document not found' });
        }

        console.log('Document deleted successfully:', deletedDoc[0]);
        return res.status(200).json({ 
          success: true, 
          message: 'Document deleted successfully',
          deletedDocument: deletedDoc[0]
        });
      } catch (dbError) {
        console.error('Database deletion error:', dbError);
        return res.status(500).json({ 
          error: 'Failed to delete document from database',
          details: dbError.message 
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Documents API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Board members handler function
async function handleBoardMembers(req, res, sql) {
  try {
    if (req.method === 'GET') {
      const boardMembers = await sql`
        SELECT id, name, role, email, phone, description, 
               display_order as "displayOrder", is_active as "isActive"
        FROM board_members 
        ORDER BY display_order ASC, id ASC
      `;
      return res.status(200).json(boardMembers);
    }

    if (req.method === 'POST') {
      const { name, role, email, phone, description, displayOrder } = req.body;

      if (!name || !role) {
        return res.status(400).json({ error: 'Name and role are required' });
      }

      const newMember = await sql`
        INSERT INTO board_members (name, role, email, phone, description, display_order)
        VALUES (${name}, ${role}, ${email || null}, ${phone || null}, ${description || null}, ${displayOrder || 0})
        RETURNING id, name, role, email, phone, description, 
                  display_order as "displayOrder", is_active as "isActive"
      `;

      return res.status(201).json(newMember[0]);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      const { name, role, email, phone, description, displayOrder, isActive } = req.body;

      if (!name || !role) {
        return res.status(400).json({ error: 'Name and role are required' });
      }

      const updatedMember = await sql`
        UPDATE board_members 
        SET name = ${name},
            role = ${role},
            email = ${email || null},
            phone = ${phone || null},
            description = ${description || null},
            display_order = ${displayOrder || 0},
            is_active = ${isActive !== undefined ? isActive : true}
        WHERE id = ${id}
        RETURNING id, name, role, email, phone, description, 
                  display_order as "displayOrder", is_active as "isActive"
      `;

      if (updatedMember.length === 0) {
        return res.status(404).json({ error: 'Board member not found' });
      }

      return res.status(200).json(updatedMember[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

      const deletedMember = await sql`
        DELETE FROM board_members 
        WHERE id = ${id}
        RETURNING id
      `;

      if (deletedMember.length === 0) {
        return res.status(404).json({ error: 'Board member not found' });
      }

      return res.status(200).json({ message: 'Board member deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Board members API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}