// The single place that decides which video URL may become an <iframe>.
// Both tiers import it: the server sanitizer (api/_shared/middleware.js) on
// write and SafeHtml on render, so a frame one of them accepts is exactly the
// frame the other accepts.
//
// Only YouTube's no-cookie player is allowed, because it is the only third-party
// frame source the CSP in vercel.json permits. The src is rebuilt from the video
// id rather than passed through, which drops autoplay, referrer and tracking
// parameters an author may have pasted along with the URL.
export const YOUTUBE_EMBED_HOST = 'www.youtube-nocookie.com';

// Player ids are 11 characters today, but YouTube has never promised that, so
// accept the character set rather than a fixed length.
const EMBED_PATH = /^\/embed\/([\w-]{6,20})$/;

/**
 * Normalize a YouTube no-cookie embed URL, or reject it.
 * @param {string} src - The src attribute to check.
 * @returns {string|null} - The canonical embed URL, or null if not embeddable.
 */
export function youtubeEmbedSrc(src) {
  if (!src || typeof src !== 'string') return null;

  let url;
  try {
    url = new URL(src);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== YOUTUBE_EMBED_HOST) return null;

  const match = EMBED_PATH.exec(url.pathname);
  if (!match) return null;

  // A start offset is the one parameter worth keeping: it is part of the link
  // an author copies when they want to point at a moment in the video.
  const start = Number.parseInt(url.searchParams.get('start') ?? '', 10);
  const embedUrl = `https://${YOUTUBE_EMBED_HOST}/embed/${match[1]}`;
  return Number.isInteger(start) && start > 0 ? `${embedUrl}?start=${start}` : embedUrl;
}
