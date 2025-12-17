import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';
import { requireCsrf } from './_shared/middleware.js';

export default async function handler(req, res) {
  // Security headers
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://fau-erdal-barnehage.vercel.app']
    : ['http://localhost:5000', 'http://localhost:3000', 'http://127.0.0.1:5000'];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
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

  // CSRF protection for file uploads
  if (!requireCsrf(req, res)) return;

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

    // File upload validation
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    const ALLOWED_MIME_TYPES = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    const ALLOWED_EXTENSIONS = [
      '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
      '.doc', '.docx', '.xls', '.xlsx', '.txt'
    ];

    // Validate file size (check base64 data length)
    const estimatedSize = (fileData.length * 3) / 4; // Approximate base64 decoded size
    if (estimatedSize > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: 'File size exceeds maximum allowed size of 10MB'
      });
    }

    // Sanitize and validate filename
    const sanitizedFilename = filename
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace invalid chars
      .replace(/\.+/g, '.') // Remove consecutive dots
      .substring(0, 255); // Limit length

    // Validate file extension
    const fileExtension = sanitizedFilename.substring(sanitizedFilename.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return res.status(400).json({
        error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
      });
    }

    // Validate base64 data format
    if (!fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/)) {
      return res.status(400).json({ error: 'Invalid file data format' });
    }

    // Extract and validate MIME type from base64 data
    const mimeTypeMatch = fileData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    const detectedMimeType = mimeTypeMatch ? mimeTypeMatch[1] : '';
    if (!ALLOWED_MIME_TYPES.includes(detectedMimeType)) {
      return res.status(400).json({
        error: `File type '${detectedMimeType}' not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      });
    }

    // Sanitize text inputs to prevent XSS
    const sanitizeText = (text) => {
      if (!text) return '';
      return text
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .substring(0, 1000); // Limit length
    };

    const sanitizedTitle = sanitizeText(title);
    const sanitizedDescription = sanitizeText(description);
    const sanitizedCategory = category ? sanitizeText(category) : 'annet';
    const sanitizedUploadedBy = uploadedBy ? sanitizeText(uploadedBy) : 'Unknown';

    // Validate sanitized inputs
    if (!sanitizedTitle || sanitizedTitle.length < 1) {
      return res.status(400).json({ error: 'Valid title is required' });
    }

    // Upload to Cloudinary with additional security options
    const uploadResult = await cloudinary.uploader.upload(fileData, {
      resource_type: 'auto',
      public_id: `fau-documents/${Date.now()}-${sanitizedFilename}`,
      use_filename: false, // Don't use user-provided filename in Cloudinary
      folder: 'fau-documents',
      allowed_formats: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'txt']
    });

    // Save document to database with sanitized inputs
    const newDocument = await sql`
      INSERT INTO documents (title, filename, cloudinary_url, file_size, mime_type, category, description, uploaded_by, uploaded_at)
      VALUES (
        ${sanitizedTitle},
        ${sanitizedFilename},
        ${uploadResult.secure_url},
        ${uploadResult.bytes || 0},
        ${detectedMimeType},
        ${sanitizedCategory},
        ${sanitizedDescription},
        ${sanitizedUploadedBy},
        NOW()
      )
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