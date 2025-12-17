import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
} from './_shared/middleware.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  try {
    const sql = getDb();

    if (req.method === 'GET') {
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
      // Authenticated access required for deletion
      const user = parseAuthToken(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // CSRF protection for state-changing requests
      if (!requireCsrf(req, res)) return;

      const { id } = req.query;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'Valid document ID required' });
      }

      const documentId = parseInt(id);

      const deletedDoc = await sql`
        DELETE FROM documents WHERE id = ${documentId} RETURNING id, cloudinary_url, filename
      `;

      if (deletedDoc.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully',
        deletedDocument: deletedDoc[0]
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    return handleError(res, error);
  }
}
