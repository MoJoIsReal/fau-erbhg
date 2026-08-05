import { getDb } from './_shared/database.js';
import { configureCloudinary } from './_shared/cloudinary.js';
import {
  withApiHandler,
  requireCsrf,
  requireRole,
} from './_shared/middleware.js';
import { COUNCIL_ROLES } from '../shared/constants.js';

// GET /api/documents?action=download&id=123 redirects to the file's Cloudinary
// URL. Folded in here (rather than its own function) to stay within the
// Vercel Hobby serverless-function budget.
async function handleDownload(req, res, sql) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Document ID is required' });
  }

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
    `;

    return res.status(200).json(documents);
  }

  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, COUNCIL_ROLES, sql);
    if (!user) return;

    if (!requireCsrf(req, res)) return;

    const { id } = req.query;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Valid document ID required' });
    }

    const documentId = parseInt(id);

    const deletedDoc = await sql`
      DELETE FROM documents
      WHERE id = ${documentId}
      RETURNING id, cloudinary_url, cloudinary_public_id, filename, mime_type
    `;

    if (deletedDoc.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const publicId = deletedDoc[0].cloudinary_public_id;
    if (publicId) {
      try {
        const cloudinary = configureCloudinary();
        const resourceType = deletedDoc[0].mime_type?.startsWith('image/') ? 'image' : 'raw';
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      } catch (cloudinaryError) {
        console.error('Cloudinary cleanup failed:', cloudinaryError.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
      deletedDocument: deletedDoc[0]
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
