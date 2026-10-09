-- Small grid copies of shared photos (docs/mediedeling.md, MEDIA_PREVIEW_* in
-- shared/media.js). The share page showed every photo's original in its grid:
-- a phone camera's 2–6 MB file decoded at full size for a 180 px tile, which
-- is slow and heavy on mobile data and can make iOS Safari reload the page.
--
-- The admin's browser now also uploads a small WebP/JPEG copy, drawn on a
-- canvas (so it carries no EXIF or GPS), under its own random object key. The
-- original is still uploaded and shown untouched. Both columns stay NULL for a
-- file without a preview, including every file uploaded before this; the grid
-- then shows the original as it did. preview_bytes counts against the storage
-- quota with size_bytes.
--
-- Additive and safe to rerun. Apply before deploying the code that writes it.

ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS preview_key text UNIQUE,
  ADD COLUMN IF NOT EXISTS preview_bytes integer CHECK (preview_bytes IS NULL OR preview_bytes > 0);

-- Verify:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'media_files' AND column_name IN ('preview_key', 'preview_bytes');
