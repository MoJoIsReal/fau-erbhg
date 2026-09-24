import { getDb } from './_shared/database.js';
import { configureCloudinary } from './_shared/cloudinary.js';
import { parseCloudinaryDeliveryUrl } from './_shared/cloudinary-url.js';
import {
  withApiHandler,
  requireCsrf,
  requireIntId,
  requireRole,
} from './_shared/middleware.js';
import { COUNCIL_ROLES } from '../shared/constants.js';

// GET /api/documents?action=download&id=123 redirects to the file's Cloudinary
// URL. Folded in here (rather than its own function) to stay within the
// Vercel Hobby serverless-function budget.
async function handleDownload(req, res, sql) {
  const id = requireIntId(req, res);
  if (!id) return;

  const documents = await sql`
    SELECT id, title, filename, cloudinary_url, mime_type
    FROM documents
    WHERE id = ${id}
  `;

  if (documents.length === 0) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const document = documents[0];

  if (!document.cloudinary_url) {
    return res.status(404).json({ error: 'File URL not found' });
  }

  // Redirect to Cloudinary URL for direct download
  return res.redirect(302, document.cloudinary_url);
}

export default withApiHandler(async function handler(req, res) {
  const sql = getDb();

  if (req.method === 'GET') {
    if (req.query?.action === 'download') {
      return handleDownload(req, res, sql);
    }

    // Public access - Get all documents
    const documents = await sql`
      SELECT
        id,
        title,
        filename,
        cloudinary_url as "fileUrl",
        file_size as "fileSize",
        mime_type as "mimeType",
        category,
        description,
        uploaded_by as "uploadedBy",
        uploaded_at as "uploadedAt"
      FROM documents
      ORDER BY uploaded_at DESC
      LIMIT 500
    `;

    return res.status(200).json(documents);
  }

  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, COUNCIL_ROLES, sql);
    if (!user) return;

    if (!requireCsrf(req, res)) return;

    const documentId = requireIntId(req, res);
    if (!documentId) return;

    const documents = await sql`
      SELECT id, cloudinary_url, cloudinary_public_id, filename, mime_type
      FROM documents
      WHERE id = ${documentId}
    `;

    if (documents.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documents[0];
    // The verified delivery URL carries the provider type (PDFs can be image
    // resources). Never guess from MIME, or delete an unrelated stored ID.
    const url = new URL(document.cloudinary_url);
    const delivery = parseCloudinaryDeliveryUrl(url);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com'
        || delivery.cloudName !== process.env.CLOUDINARY_CLOUD_NAME
        || !['image', 'raw'].includes(delivery.resourceType)
        || delivery.deliveryType !== 'upload'
        || !delivery.publicId.startsWith('fau-documents/')
        || delivery.publicId.split('/').some(part => !part || part === '.' || part === '..')
        || (document.cloudinary_public_id && document.cloudinary_public_id !== delivery.publicId)) {
      throw new Error('Invalid stored document delivery identity');
    }

    const cloudinary = configureCloudinary();
    const cleanup = await cloudinary.uploader.destroy(delivery.publicId, {
      resource_type: delivery.resourceType,
      invalidate: true,
    });
    if (!['ok', 'not found'].includes(cleanup?.result)) {
      throw new Error('Document provider cleanup did not complete');
    }

    // Keep the durable reference until cleanup succeeds. Provider failure
    // leaves the document available to retry; a DB failure after cleanup is
    // also retryable because a correctly addressed absent asset is success.
    await sql`DELETE FROM documents WHERE id = ${documentId}`;

    return res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
      deletedDocument: document
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
