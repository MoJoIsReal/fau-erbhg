import { getDb } from './_shared/database.js';
import { configureCloudinary } from './_shared/cloudinary.js';
import {
  withApiHandler,
  requireCsrf,
  requireRole,
  sanitizeText
} from './_shared/middleware.js';
import { COUNCIL_ROLES, DOCUMENT_CATEGORIES } from '../shared/constants.js';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  validateProviderUpload,
  withFileExtension,
  sanitizeFilename,
  validateUploadFile
} from './_shared/upload-validation.js';
import { parseCloudinaryDeliveryUrl } from './_shared/cloudinary-url.js';

export default withApiHandler(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();
  const decoded = await requireRole(req, res, COUNCIL_ROLES, sql);
  if (!decoded) return;

  if (!requireCsrf(req, res)) return;

  const {
    filename,
    title,
    category,
    description,
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
      return res.status(400).json({ error: validation.error, code: validation.code });
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
  if (!filename || !title || !fileUrl || !publicId) {
    return res.status(400).json({ error: 'Missing required fields', code: 'REQUIRED_FIELDS' });
  }
  // Only a category some page lists: a document filed anywhere else was public
  // through the API yet shown nowhere, so the council could not delete it.
  if (!DOCUMENT_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Unknown document category', code: 'REQUIRED_FIELDS' });
  }

  const validation = validateUploadFile({ filename, mimeType, size: reportedSize });
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error, code: validation.code });
  }

  const sanitizedFilename = validation.sanitizedFilename;
  const sanitizedPublicId = sanitizeText(publicId, 500);
  const sanitizedFileUrl = sanitizeText(fileUrl, 1000);

  let parsedUrl;
  try {
    parsedUrl = new URL(sanitizedFileUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid uploaded file URL', code: 'UPLOAD_NOT_VERIFIED' });
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'res.cloudinary.com') {
    return res.status(400).json({ error: 'Uploaded file must be hosted by Cloudinary', code: 'UPLOAD_NOT_VERIFIED' });
  }

  // Verify the URL points to our own Cloudinary account, not someone else's.
  // res.cloudinary.com is shared across all Cloudinary customers — without
  // this check, an authenticated council member could register a document
  // pointing at attacker-controlled content in a different cloud.
  const delivery = parseCloudinaryDeliveryUrl(parsedUrl);
  if (
    delivery.cloudName !== process.env.CLOUDINARY_CLOUD_NAME ||
    !['image', 'raw'].includes(delivery.resourceType) ||
    delivery.deliveryType !== 'upload'
  ) {
    return res.status(400).json({ error: 'Uploaded file must be hosted in our Cloudinary account', code: 'UPLOAD_NOT_VERIFIED' });
  }

  if (!sanitizedPublicId.startsWith('fau-documents/')) {
    return res.status(400).json({ error: 'Invalid uploaded file location', code: 'UPLOAD_NOT_VERIFIED' });
  }

  if (delivery.publicId !== sanitizedPublicId) {
    return res.status(400).json({ error: 'Uploaded file URL does not match uploaded asset', code: 'UPLOAD_NOT_VERIFIED' });
  }

  let uploadedAsset;
  try {
    const cloudinary = configureCloudinary();
    uploadedAsset = await cloudinary.api.resource(sanitizedPublicId, {
      resource_type: delivery.resourceType,
    });
  } catch {
    return res.status(400).json({ error: 'Uploaded asset could not be verified', code: 'UPLOAD_NOT_VERIFIED' });
  }

  if (uploadedAsset.public_id !== sanitizedPublicId) {
    return res.status(400).json({ error: 'Uploaded asset could not be verified', code: 'UPLOAD_NOT_VERIFIED' });
  }

  const providerValidation = validateProviderUpload({
    uploadedAsset,
    delivery,
    mimeType,
    fileExtension: validation.fileExtension,
  });
  if (!providerValidation.ok) {
    return res.status(400).json({ error: providerValidation.error, code: providerValidation.code });
  }
  const observedFileSize = providerValidation.size;
  // Store what Cloudinary actually parsed: a PNG named "bilde.jpg" is saved
  // as image/png with a .png filename, not as the JPEG it claimed to be.
  const storedMimeType = providerValidation.mimeType;
  const storedFilename = providerValidation.fileExtension === validation.fileExtension
    ? sanitizedFilename
    : withFileExtension(sanitizedFilename, providerValidation.fileExtension);

  // Sanitize text inputs to prevent XSS
  const sanitizedTitle = sanitizeText(title, 1000);
  const sanitizedDescription = sanitizeText(description, 5000);
  const sanitizedUploadedBy = sanitizeText(decoded.username, 200);

  // Validate sanitized inputs
  if (!sanitizedTitle || sanitizedTitle.length < 1) {
    return res.status(400).json({ error: 'Valid title is required', code: 'TITLE_REQUIRED' });
  }

  const newDocument = await sql`
    INSERT INTO documents (title, filename, cloudinary_url, cloudinary_public_id, file_size, mime_type, category, description, uploaded_by, uploaded_at)
    VALUES (
      ${sanitizedTitle},
      ${storedFilename},
      ${sanitizedFileUrl},
      ${sanitizedPublicId},
      ${observedFileSize},
      ${storedMimeType},
      ${category},
      ${sanitizedDescription},
      ${sanitizedUploadedBy},
      ${new Date().toISOString()}
    )
    RETURNING id, title, filename, cloudinary_url as "fileUrl", file_size as "fileSize",
              mime_type as "mimeType", category, description, uploaded_at as "uploadedAt"
  `;

  // The same fields the public list shows (GET /api/documents): never the
  // uploader's login e-mail.
  return res.status(200).json({
    success: true,
    document: newDocument[0],
    fileUrl: sanitizedFileUrl,
    publicId: sanitizedPublicId
  });

});
