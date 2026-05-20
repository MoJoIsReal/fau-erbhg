import { getDb } from './_shared/database.js';
import { configureCloudinary } from './_shared/cloudinary.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  requireCsrf,
  requireRole,
  sanitizeText
} from './_shared/middleware.js';
import { COUNCIL_ROLES } from '../shared/constants.js';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  sanitizeFilename,
  validateUploadFile
} from './_shared/upload-validation.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const decoded = requireRole(req, res, COUNCIL_ROLES);
  if (!decoded) return;

  if (!requireCsrf(req, res)) return;

  try {
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

    // Clients send the file size as either `size` or `fileSize` — accept both
    // so the size check on the sign step actually catches >10MB uploads
    // instead of silently letting Cloudinary reject them later.
    const reportedSize = fileSize ?? req.body.size;

    if (req.query.action === 'sign' || req.body.action === 'sign') {
      const validation = validateUploadFile({ filename, mimeType, size: reportedSize });

      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const cloudinary = configureCloudinary();
      const timestamp = Math.round(Date.now() / 1000);
      const publicId = `${Date.now()}-${validation.sanitizedFilename}`;
      const folder = 'fau-documents';
      const allowedFormats = ALLOWED_UPLOAD_EXTENSIONS.map((ext) => ext.slice(1)).join(',');
      // Note: don't sign `max_file_size` here. It is not accepted as a per-upload
      // parameter by Cloudinary's upload endpoint (only on upload presets), so
      // Cloudinary strips it when re-computing the canonical for signature
      // verification — including it on our side yields "Invalid Signature".
      // The 10 MB cap is already enforced by `validateUploadFile` above.
      const paramsToSign = {
        timestamp,
        folder,
        public_id: publicId,
        allowed_formats: allowedFormats,
      };

      const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        process.env.CLOUDINARY_API_SECRET
      );

      return res.status(200).json({
        signature,
        timestamp,
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        folder,
        publicId,
        allowedFormats,
        maxFileSize: MAX_UPLOAD_SIZE_BYTES,
        allowedMimeTypes: ALLOWED_UPLOAD_MIME_TYPES,
        uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
      });
    }

    const sql = getDb();

    if (!filename || !title || !fileUrl || !publicId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validation = validateUploadFile({ filename, mimeType, size: reportedSize });
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

    // Verify the URL points to our own Cloudinary account, not someone else's.
    // res.cloudinary.com is shared across all Cloudinary customers — without
    // this check, an authenticated council member could register a document
    // pointing at attacker-controlled content in a different cloud.
    const expectedCloudPrefix = `/${process.env.CLOUDINARY_CLOUD_NAME}/`;
    if (!parsedUrl.pathname.startsWith(expectedCloudPrefix)) {
      return res.status(400).json({ error: 'Uploaded file must be hosted in our Cloudinary account' });
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

    const safeFileSize = Number.isFinite(Number(reportedSize)) ? Math.max(0, Math.floor(Number(reportedSize))) : 0;

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
