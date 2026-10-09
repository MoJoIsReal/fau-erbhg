/**
 * Private media sharing — the rules both tiers must agree on.
 * Plain JS so api/media.js and the Vite-bundled admin page and share page can
 * import the same values. Types live in media.d.ts. See docs/mediedeling.md.
 */

// The only types a share may hold, each with the kind of player it gets.
export const MEDIA_MIME_TYPES = Object.freeze({
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/wav': 'audio',
});

// Browsers disagree on the name of the same format (Chrome reports an .m4a
// as audio/x-m4a, Firefox a .wav as audio/wave). Normalised here so the
// allow-list above stays the one canonical set the API validates against.
const MIME_ALIASES = Object.freeze({
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/aac': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'video/x-m4v': 'video/mp4',
});

// For a file whose type the browser left empty (common for .mov on Windows).
const EXTENSION_TYPES = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
});

/** The `accept` attribute for the admin file picker. */
export const MEDIA_ACCEPT = [
  ...Object.keys(MEDIA_MIME_TYPES),
  ...Object.keys(EXTENSION_TYPES).map((ext) => `.${ext}`),
].join(',');

/**
 * The canonical allowed MIME type for a browser-reported type and file name,
 * or null when the file is not something a share may hold.
 */
export function normalizeMediaMime(type, filename = '') {
  const reported = typeof type === 'string' ? type.trim().toLowerCase() : '';
  const canonical = MIME_ALIASES[reported] ?? reported;
  if (Object.hasOwn(MEDIA_MIME_TYPES, canonical)) return canonical;
  if (reported && reported !== 'application/octet-stream') return null;
  const ext = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (ext && EXTENSION_TYPES[ext]) || null;
}

/** 'image' | 'video' | 'audio' for an allowed type, otherwise null. */
export function mediaKind(mimeType) {
  return Object.hasOwn(MEDIA_MIME_TYPES, mimeType) ? MEDIA_MIME_TYPES[mimeType] : null;
}

// Lifetime. A new share lives 90 days unless the council picks otherwise, at
// most 180; each extension adds at most 180 days; nothing lives longer than
// 365 days after it was published. The R2 lifecycle rule (368 days, see
// docs/mediedeling.md) is set just above that ceiling as a safety net.
export const MEDIA_DEFAULT_LIFETIME_DAYS = 90;
export const MEDIA_MAX_INITIAL_DAYS = 180;
export const MEDIA_MAX_EXTENSION_DAYS = 180;
export const MEDIA_MAX_LIFETIME_DAYS = 365;

export const MEDIA_TITLE_MAX = 120;
export const MEDIA_DESCRIPTION_MAX = 1000;
export const MEDIA_MAX_FILES_PER_SHARE = 200;

// A PIN is digits only, easy to pass on by voice; the API's per-share failure
// limit (not the hash) is what makes guessing it impractical. A new PIN needs
// 6–8 digits: thirty guesses a day would work through a 4-digit PIN within a
// share's lifetime. Shares made before that rule may still carry a 4- or
// 5-digit PIN, so the share page and the view check accept 4–8 until the last
// of those has expired (365 days at most).
export const MEDIA_PIN_PATTERN = /^\d{4,8}$/;
export const MEDIA_NEW_PIN_PATTERN = /^\d{6,8}$/;

// The share page's grid shows a small copy of each photo instead of the
// original (a phone camera's 12–48 MP file, 2–6 MB, decoded at full size for a
// 180 px tile). The admin's browser draws it on a canvas at upload time, which
// re-encodes only that copy: the original is uploaded untouched, as before,
// and is what the lightbox and the download show. Canvas output carries no
// EXIF or GPS. Optional: a photo without one shows the original in the grid.
export const MEDIA_PREVIEW_MIME_TYPES = Object.freeze(['image/webp', 'image/jpeg']);
export const MEDIA_PREVIEW_MAX_BYTES = 512 * 1024;
/** Longest edge, in pixels: a 3-column tile on a 3x phone is about 360 px. */
export const MEDIA_PREVIEW_EDGE = 640;

// Why the media API refused something. The share page and the admin page key
// their message off these, never off the `error` text.
export const MEDIA_ERROR_CODES = Object.freeze([
  'SHARE_UNAVAILABLE',
  'PIN_REQUIRED',
  'PIN_INVALID',
  'PIN_LOCKED',
  'RATE_LIMITED',
  'NOT_CONFIGURED',
  'UNSUPPORTED_TYPE',
  'FILE_TOO_LARGE',
  'STORAGE_QUOTA',
  'TOO_MANY_FILES',
  'UPLOAD_MISMATCH',
  'NOT_DRAFT',
  'EMPTY_SHARE',
  'MAX_LIFETIME',
]);
