import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_UPLOAD_SIZE_BYTES,
  getFileExtension,
  providerMetadataMatches,
  validateProviderUpload,
  sanitizeFilename,
  validateUploadFile,
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

test('declared MIME type must match extension and size must be a safe non-negative integer', () => {
  assert.equal(validateUploadFile({ filename: 'photo.jpg', mimeType: 'image/png', size: 1 }).ok, false);
  assert.equal(validateUploadFile({ filename: 'file.pdf', mimeType: 'application/pdf', size: -1 }).ok, false);
  assert.equal(validateUploadFile({ filename: 'file.pdf', mimeType: 'application/pdf', size: 'NaN' }).ok, false);
  assert.equal(validateUploadFile({ filename: 'file.pdf', mimeType: 'application/pdf', size: 1.5 }).ok, false);
});

test('Cloudinary-observed resource type and image format must match the validated file', () => {
  assert.equal(providerMetadataMatches({
    delivery: { resourceType: 'image' },
    uploadedAsset: { resource_type: 'image', format: 'jpg' },
    mimeType: 'image/jpeg',
    fileExtension: '.jpeg',
  }), true);
  assert.equal(providerMetadataMatches({
    delivery: { resourceType: 'image' },
    uploadedAsset: { resource_type: 'image', format: 'png' },
    mimeType: 'image/jpeg',
    fileExtension: '.jpg',
  }), false);
  assert.equal(providerMetadataMatches({
    delivery: { resourceType: 'raw' },
    uploadedAsset: { resource_type: 'raw' },
    mimeType: 'application/pdf',
    fileExtension: '.pdf',
  }), true);
});

test('provider upload validation accepts only safe observed sizes', () => {
  const base = {
    delivery: { resourceType: 'raw' },
    mimeType: 'application/pdf',
    fileExtension: '.pdf',
  };
  assert.deepEqual(validateProviderUpload({
    ...base,
    uploadedAsset: { resource_type: 'raw', bytes: 123 },
  }), { ok: true, size: 123 });
  assert.equal(validateProviderUpload({
    ...base,
    uploadedAsset: { resource_type: 'raw', bytes: -1 },
  }).ok, false);
  assert.equal(validateProviderUpload({
    ...base,
    uploadedAsset: { resource_type: 'raw', bytes: 'not-a-number' },
  }).ok, false);
  assert.equal(validateProviderUpload({
    ...base,
    uploadedAsset: { resource_type: 'raw', bytes: MAX_UPLOAD_SIZE_BYTES + 1 },
  }).ok, false);
});
