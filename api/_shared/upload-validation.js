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

export const MIME_EXTENSION_MAP = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/plain': ['.txt'],
};

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

  if (!mimeType || !ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType)) {
    return {
      ok: false,
      error: `File type '${mimeType || '(missing)'}' not allowed. Allowed types: ${ALLOWED_UPLOAD_MIME_TYPES.join(', ')}`
    };
  }

  if (!MIME_EXTENSION_MAP[mimeType]?.includes(fileExtension)) {
    return { ok: false, error: 'File extension does not match the declared content type' };
  }

  const numericSize = Number(size);
  if (!Number.isSafeInteger(numericSize) || numericSize < 0) {
    return { ok: false, error: 'Valid non-negative file size is required' };
  }

  if (numericSize > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, error: 'File size exceeds maximum allowed size of 10MB' };
  }

  return { ok: true, sanitizedFilename, fileExtension, size: numericSize };
}

export function expectedCloudinaryResourceTypes(mimeType) {
  if (mimeType?.startsWith('image/')) return ['image'];
  // Cloudinary may store PDF uploads as either image resources (for page
  // transformation) or raw resources, depending on account/upload settings.
  if (mimeType === 'application/pdf') return ['image', 'raw'];
  return ['raw'];
}

// The format Cloudinary parsed out of the bytes is the only trustworthy signal
// about what a file really is: both the filename and the browser's File.type
// are derived from the extension the uploader happened to give it, so a PNG
// saved as "bilde.jpg" arrives claiming to be a JPEG.
export const IMAGE_FORMAT_MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function withFileExtension(filename, fileExtension) {
  const name = String(filename || '');
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  return `${base}${fileExtension}`;
}

export function providerMetadataMatches({ uploadedAsset, delivery, mimeType, fileExtension }) {
  const expectedResourceTypes = expectedCloudinaryResourceTypes(mimeType);
  if (delivery?.resourceType !== uploadedAsset?.resource_type
      || !expectedResourceTypes.includes(delivery?.resourceType)) {
    return false;
  }

  if (delivery.resourceType === 'image') {
    const observed = String(uploadedAsset?.format || '').toLowerCase();
    // A PDF delivered as an image resource still has to be a PDF.
    if (mimeType === 'application/pdf') return observed === 'pdf';
    // For images, require that Cloudinary parsed a format we allow — not that
    // it agrees with the extension. Requiring agreement rejected real images
    // for nothing (an uploader controls both the name and the declared type,
    // so the two matching proves nothing), while the parsed format is what
    // actually rules out a disguised file.
    return Object.prototype.hasOwnProperty.call(IMAGE_FORMAT_MIME_TYPES, observed);
  }

  // Cloudinary raw resources do not consistently expose `format`; the parsed
  // delivery URL/public_id binding still includes the original extension.
  return !uploadedAsset?.format
    || String(uploadedAsset.format).toLowerCase() === fileExtension.slice(1);
}

export function validateProviderUpload({ uploadedAsset, delivery, mimeType, fileExtension }) {
  if (!providerMetadataMatches({ uploadedAsset, delivery, mimeType, fileExtension })) {
    const observed = String(uploadedAsset?.format || '').toLowerCase();
    // Name the actual format when we have one and it is the format that was
    // rejected — "does not match" told an uploader nothing about what to fix.
    const resourceTypeAgrees = delivery?.resourceType === uploadedAsset?.resource_type;
    return {
      ok: false,
      error: observed && resourceTypeAgrees
        ? `Uploaded asset is a "${observed}" file, which is not an allowed type`
        : 'Uploaded asset type does not match the declared file type',
    };
  }

  const size = Number(uploadedAsset?.bytes);
  if (!Number.isSafeInteger(size) || size < 0) {
    return { ok: false, error: 'Uploaded asset has invalid size metadata' };
  }
  if (size > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, error: 'File size exceeds maximum allowed size of 10MB' };
  }

  // Report what the file actually is, so the caller stores truthful metadata
  // rather than the extension the uploader chose.
  const observedFormat = String(uploadedAsset?.format || '').toLowerCase();
  const observedMimeType = IMAGE_FORMAT_MIME_TYPES[observedFormat];

  return {
    ok: true,
    size,
    mimeType: observedMimeType ?? mimeType,
    fileExtension: observedMimeType ? `.${observedFormat}` : fileExtension,
  };
}
