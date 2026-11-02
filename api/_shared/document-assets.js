import { configureCloudinary } from './cloudinary.js';
import { parseCloudinaryDeliveryUrl } from './cloudinary-url.js';
import { reportProviderError } from './provider-errors.js';

export function isCloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME
    && process.env.CLOUDINARY_API_KEY
    && process.env.CLOUDINARY_API_SECRET);
}

// The provider identity of a stored document, read from its verified delivery
// URL (PDFs can be image resources). Never guessed from MIME, and never an ID
// outside our own cloud and folder. Throws for anything else.
export function documentDeliveryIdentity(document) {
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
  return delivery;
}

// Deletes a document's file at the provider. "Not found" counts as done, so a
// retry after a database failure that followed a successful delete succeeds.
export async function destroyDocumentAsset(document) {
  const delivery = documentDeliveryIdentity(document);
  const cloudinary = configureCloudinary();
  const cleanup = await cloudinary.uploader.destroy(delivery.publicId, {
    resource_type: delivery.resourceType,
    invalidate: true,
  });
  if (!['ok', 'not found'].includes(cleanup?.result)) {
    throw new Error('Document provider cleanup did not complete');
  }
}

// An image inserted in the rich-text editor is a documents row plus a public
// Cloudinary file. Nothing removed either when the image left the text, or the
// post, event or calendar entry holding it was deleted, and no page lists
// them, so a photo taken out of a post stayed public for good. Each morning,
// an editor image no rich text refers to any more is deleted, file first.
// The grace period covers a draft still open in someone's editor; a reference
// by URL or by public ID keeps the image, whichever way it was written.
export const EDITOR_IMAGE_GRACE_DAYS = 7;
export const EDITOR_IMAGES_PER_RUN = 50;

export async function purgeUnusedEditorImages(sql, now = new Date()) {
  if (!isCloudinaryConfigured()) return null;
  const cutoff = new Date(now.getTime() - EDITOR_IMAGE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const unused = await sql`
    WITH candidate AS (
      SELECT id, cloudinary_url, cloudinary_public_id,
             COALESCE(NULLIF(cloudinary_public_id, ''), cloudinary_url) AS public_ref
      FROM documents
      WHERE category = 'editor-image'
        AND cloudinary_url IS NOT NULL
        AND uploaded_at < ${cutoff}
    )
    SELECT c.id, c.cloudinary_url, c.cloudinary_public_id
    FROM candidate c
    WHERE NOT EXISTS (
        SELECT 1 FROM blog_posts b
        WHERE strpos(b.content, c.cloudinary_url) > 0 OR strpos(b.content, c.public_ref) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM events e
        WHERE strpos(e.description, c.cloudinary_url) > 0 OR strpos(e.description, c.public_ref) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM yearly_calendar_entries y
        WHERE strpos(y.description, c.cloudinary_url) > 0 OR strpos(y.description, c.public_ref) > 0
      )
    ORDER BY c.id
    LIMIT ${EDITOR_IMAGES_PER_RUN}
  `;

  let deleted = 0;
  let failed = 0;
  for (const image of unused) {
    try {
      await destroyDocumentAsset(image);
      await sql`DELETE FROM documents WHERE id = ${image.id} AND category = 'editor-image'`;
      deleted += 1;
    } catch (error) {
      // Kept for tomorrow's run; one bad row must not stop the rest.
      failed += 1;
      reportProviderError('Failed to delete an unused editor image', error);
    }
  }
  return { editorImagesDeleted: deleted, editorImagesFailed: failed };
}
