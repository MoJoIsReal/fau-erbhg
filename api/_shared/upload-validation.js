export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
];

export const ALLOWED_UPLOAD_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.doc', '.docx', '.xls', '.xlsx', '.txt'
];

export function sanitizeFilename(filename) {
  return String(filename || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .substring(0, 255);
}

export function getFileExtension(filename) {
  const sanitizedFilename = sanitizeFilename(filename);
  const dotIndex = sanitizedFilename.lastIndexOf('.');
  return dotIndex >= 0 ? sanitizedFilename.substring(dotIndex).toLowerCase() : '';
}

export function validateUploadFile({ filename, mimeType, size }) {
  const sanitizedFilename = sanitizeFilename(filename);
  const fileExtension = getFileExtension(sanitizedFilename);

  if (!sanitizedFilename || !fileExtension) {
    return { ok: false, error: 'Valid filename is required' };
  }

  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(fileExtension)) {
    return {
      ok: false,
      error: `File type not allowed. Allowed types: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`
    };
  }

  if (mimeType && !ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType)) {
    return {
      ok: false,
      error: `File type '${mimeType}' not allowed. Allowed types: ${ALLOWED_UPLOAD_MIME_TYPES.join(', ')}`
    };
  }

  if (Number(size) > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, error: 'File size exceeds maximum allowed size of 10MB' };
  }

  return { ok: true, sanitizedFilename, fileExtension };
}
