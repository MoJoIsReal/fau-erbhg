import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_UPLOAD_SIZE_BYTES,
  getFileExtension,
  sanitizeFilename,
  validateProviderUpload,
  validateUploadFile,
  withFileExtension,
} from '../api/_shared/upload-validation.js';

test('filename sanitization removes path and unsafe characters', () => {
  const sanitized = sanitizeFilename('../../FAU referat (juni).pdf');
  assert.equal(sanitized.includes('/'), false);
  assert.equal(sanitized.includes(' '), false);
  assert.match(sanitized, /FAU_referat__juni_\.pdf$/);
  assert.equal(getFileExtension('PHOTO.JPEG'), '.jpeg');
});

test('an allowed PDF at the size boundary is accepted', () => {
  assert.deepEqual(
    validateUploadFile({
      filename: 'referat.pdf',
      mimeType: 'application/pdf',
      size: MAX_UPLOAD_SIZE_BYTES,
    }),
    // validateUploadFile returns the normalized numeric size alongside the
    // sanitized name, so callers persist one canonical value.
    { ok: true, sanitizedFilename: 'referat.pdf', fileExtension: '.pdf', size: MAX_UPLOAD_SIZE_BYTES },
  );
});

test('missing and disallowed extensions are rejected', () => {
  assert.equal(
    validateUploadFile({ filename: 'referat', mimeType: 'application/pdf', size: 1 }).ok,
    false,
  );
  assert.equal(
    validateUploadFile({ filename: 'payload.html', mimeType: 'text/plain', size: 1 }).ok,
    false,
  );
});

test('missing and disallowed MIME types are rejected', () => {
  assert.equal(validateUploadFile({ filename: 'file.pdf', size: 1 }).ok, false);
  assert.equal(
    validateUploadFile({ filename: 'file.pdf', mimeType: 'text/html', size: 1 }).ok,
    false,
  );
});

test('files larger than the configured limit are rejected', () => {
  const result = validateUploadFile({
    filename: 'referat.pdf',
    mimeType: 'application/pdf',
    size: MAX_UPLOAD_SIZE_BYTES + 1,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /10MB/);
});

// Cloudinary parses the real format out of the bytes. The filename and the
// browser's File.type both come from the extension the uploader chose, so the
// two agreeing proves nothing — these cases pin that the provider's verdict is
// what decides, and that we store what the file actually is.
test('a real image whose extension lies is accepted and stored as what it is', () => {
  const result = validateProviderUpload({
    uploadedAsset: { resource_type: 'image', format: 'png', bytes: 2048 },
    delivery: { resourceType: 'image' },
    mimeType: 'image/jpeg',
    fileExtension: '.jpg',
  });

  assert.equal(result.ok, true);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.fileExtension, '.png');
  assert.equal(withFileExtension('feriebilde.jpg', result.fileExtension), 'feriebilde.png');
});

test('an image with a truthful extension keeps its declared metadata', () => {
  const result = validateProviderUpload({
    uploadedAsset: { resource_type: 'image', format: 'jpg', bytes: 2048 },
    delivery: { resourceType: 'image' },
    mimeType: 'image/jpeg',
    fileExtension: '.jpg',
  });

  assert.deepEqual(
    { ok: result.ok, mimeType: result.mimeType, fileExtension: result.fileExtension },
    { ok: true, mimeType: 'image/jpeg', fileExtension: '.jpg' },
  );
});

test('a non-image disguised as an image is still rejected, and named', () => {
  for (const format of ['pdf', 'svg', 'heic']) {
    const result = validateProviderUpload({
      uploadedAsset: { resource_type: 'image', format, bytes: 2048 },
      delivery: { resourceType: 'image' },
      mimeType: 'image/png',
      fileExtension: '.png',
    });

    assert.equal(result.ok, false, format);
    assert.match(result.error, new RegExp(`"${format}"`));
  }
});

test('a PDF delivered as an image resource must still be a PDF', () => {
  const asPdf = validateProviderUpload({
    uploadedAsset: { resource_type: 'image', format: 'pdf', bytes: 2048 },
    delivery: { resourceType: 'image' },
    mimeType: 'application/pdf',
    fileExtension: '.pdf',
  });
  assert.equal(asPdf.ok, true);
  assert.equal(asPdf.mimeType, 'application/pdf');

  const notPdf = validateProviderUpload({
    uploadedAsset: { resource_type: 'image', format: 'png', bytes: 2048 },
    delivery: { resourceType: 'image' },
    mimeType: 'application/pdf',
    fileExtension: '.pdf',
  });
  assert.equal(notPdf.ok, false);
});

test('a resource type that disagrees with the delivery URL is rejected', () => {
  const result = validateProviderUpload({
    uploadedAsset: { resource_type: 'raw', format: 'png', bytes: 2048 },
    delivery: { resourceType: 'image' },
    mimeType: 'image/png',
    fileExtension: '.png',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Uploaded asset type does not match the declared file type');
});

test('the size limit still applies to a provider-verified image', () => {
  const result = validateProviderUpload({
    uploadedAsset: { resource_type: 'image', format: 'png', bytes: MAX_UPLOAD_SIZE_BYTES + 1 },
    delivery: { resourceType: 'image' },
    mimeType: 'image/png',
    fileExtension: '.png',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /exceeds maximum/);
});
