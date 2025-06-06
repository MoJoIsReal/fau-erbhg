import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';

export default async function handler(req, res) {
  // Security headers
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://fau-erdal-barnehage.vercel.app']
    : ['http://localhost:5000', 'http://localhost:3000'];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // JWT authentication check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No valid authorization token provided' });
  }

  try {
    const token = authHeader.substring(7);
    if (!process.env.SESSION_SECRET) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
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

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const sql = neon(process.env.DATABASE_URL);
    const { fileData, filename, title, category, description, uploadedBy } = req.body;
    
    if (!fileData || !filename || !title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(fileData, {
      resource_type: 'auto',
      public_id: `fau-documents/${Date.now()}-${filename}`,
      use_filename: true,
      folder: 'fau-documents'
    });

    // Save document to database
    const newDocument = await sql`
      INSERT INTO documents (title, filename, cloudinary_url, file_size, mime_type, category, description, uploaded_by, uploaded_at)
      VALUES (${title}, ${filename}, ${uploadResult.secure_url}, ${uploadResult.bytes || 0}, ${uploadResult.format || 'unknown'}, ${category || 'annet'}, ${description || ''}, ${uploadedBy || 'Unknown'}, NOW())
      RETURNING *
    `;

    return res.status(200).json({
      success: true,
      document: newDocument[0],
      fileUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id
    });

  } catch (error) {
    console.error('Upload API error:', error);
    return res.status(500).json({ 
      error: 'Upload failed'
    });
  }
}