import { configureCloudinary } from './_shared/cloudinary.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
} from './_shared/middleware.js';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  validateUploadFile,
} from './_shared/upload-validation.js';

export default async function handler(req, res) {
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const decoded = parseAuthToken(req);
  if (!decoded) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (decoded.role !== 'admin' && decoded.role !== 'member') {
    return res.status(403).json({ error: 'Council member access required' });
  }

  if (!requireCsrf(req, res)) return;

  try {
    const { filename, mimeType, size } = req.body;
    const validation = validateUploadFile({ filename, mimeType, size });

    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const cloudinary = configureCloudinary();
    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `${Date.now()}-${validation.sanitizedFilename}`;
    const folder = 'fau-documents';
    const allowedFormats = ALLOWED_UPLOAD_EXTENSIONS.map((ext) => ext.slice(1)).join(',');
    const paramsToSign = {
      timestamp,
      folder,
      public_id: publicId,
      allowed_formats: allowedFormats,
      max_file_size: MAX_UPLOAD_SIZE_BYTES,
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
  } catch (error) {
    return handleError(res, error);
  }
}
