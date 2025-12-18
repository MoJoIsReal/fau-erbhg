import { getDb } from './_shared/database.js';
import { configureCloudinary } from './_shared/cloudinary.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
  sanitizeText
} from './_shared/middleware.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // JWT authentication check (from cookies)
  const decoded = parseAuthToken(req);
  if (!decoded) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // CSRF protection for file uploads
  if (!requireCsrf(req, res)) return;

  try {
    const sql = getDb();
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
    const sanitizedTitle = sanitizeText(title, 1000);
    const sanitizedDescription = sanitizeText(description, 5000);
    const sanitizedCategory = category ? sanitizeText(category, 100) : 'annet';
    const sanitizedUploadedBy = uploadedBy ? sanitizeText(uploadedBy, 200) : 'Unknown';

    // Validate sanitized inputs
    if (!sanitizedTitle || sanitizedTitle.length < 1) {
      return res.status(400).json({ error: 'Valid title is required' });
    }

    // Configure Cloudinary (cached configuration)
    const cloudinary = configureCloudinary();

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
    return handleError(res, error);
  }
}
