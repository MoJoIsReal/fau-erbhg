import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

    if (req.method === 'POST') {
      const sql = neon(process.env.DATABASE_URL);

      // Configure Cloudinary
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });

      const { fileData, filename, title, category, description } = req.body;
      
      // Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(fileData, {
        resource_type: 'auto',
        public_id: `fau-documents/${Date.now()}-${filename}`,
        use_filename: true
      });

      // Save document to database
      const newDocument = await sql`
        INSERT INTO documents (title, filename, file_url, file_size, mime_type, category, description)
        VALUES (${title}, ${filename}, ${uploadResult.secure_url}, ${uploadResult.bytes}, ${uploadResult.resource_type}, ${category}, ${description})
        RETURNING *
      `;

      return res.status(200).json({
        success: true,
        document: newDocument[0],
        fileUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Upload API error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
}