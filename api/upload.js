import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
  sanitizeText
} from './_shared/middleware.js';
import { sanitizeFilename, validateUploadFile } from './_shared/upload-validation.js';

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

  if (decoded.role !== 'admin' && decoded.role !== 'member') {
    return res.status(403).json({ error: 'Council member access required' });
  }

  // CSRF protection for file uploads
  if (!requireCsrf(req, res)) return;

  try {
    const sql = getDb();
    const {
      filename,
      title,
      category,
      description,
      uploadedBy,
      fileUrl,
      publicId,
      fileSize,
      mimeType
    } = req.body;

    if (!filename || !title || !fileUrl || !publicId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validation = validateUploadFile({ filename, mimeType, size: fileSize });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const sanitizedFilename = validation.sanitizedFilename;
    const sanitizedPublicId = sanitizeText(publicId, 500);
    const sanitizedFileUrl = sanitizeText(fileUrl, 1000);

    let parsedUrl;
    try {
      parsedUrl = new URL(sanitizedFileUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid uploaded file URL' });
    }

    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'res.cloudinary.com') {
      return res.status(400).json({ error: 'Uploaded file must be hosted by Cloudinary' });
    }

    if (!sanitizedPublicId.startsWith('fau-documents/')) {
      return res.status(400).json({ error: 'Invalid uploaded file location' });
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

    const safeFileSize = Number.isFinite(Number(fileSize)) ? Math.max(0, Math.floor(Number(fileSize))) : 0;

    const newDocument = await sql`
      INSERT INTO documents (title, filename, cloudinary_url, cloudinary_public_id, file_size, mime_type, category, description, uploaded_by, uploaded_at)
      VALUES (
        ${sanitizedTitle},
        ${sanitizedFilename},
        ${sanitizedFileUrl},
        ${sanitizedPublicId},
        ${safeFileSize},
        ${mimeType},
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
      fileUrl: sanitizedFileUrl,
      publicId: sanitizedPublicId
    });

  } catch (error) {
    return handleError(res, error);
  }
}
