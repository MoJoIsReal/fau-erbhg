import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError
} from './_shared/middleware.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    const sql = getDb();

    // Get document from database
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

  } catch (error) {
    return handleError(res, error);
  }
}
