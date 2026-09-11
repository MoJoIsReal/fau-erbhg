import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_UPLOAD_SIZE_BYTES,
  getFileExtension,
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
