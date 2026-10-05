// Link previews for shared calendar links (/kalender?vis=event-12).
//
// Messenger, iMessage, WhatsApp, Slack and the rest build a preview by fetching
// the URL and reading its Open Graph tags without running any JavaScript, so
// the SPA's own per-page tags (usePageMeta) never reach them: every shared
// entry previewed as the site's generic homepage card. The /kalender rewrite
// in vercel.json sends only those preview crawlers here, picked out by their
// user agent; people keep getting the normal app.
//
// The page says nothing the public calendar does not already show to anyone
// who opens it: the rows come from the same public tables, and every value is
// escaped before it lands in the HTML.
import { htmlToPlainText } from '../../shared/html-text.js';
import {
  calendarEntryPath,
  isoWeekRange,
  normalizeEvent,
  normalizeYearlyEntry,
  parseCalendarDate,
} from '../../shared/calendar-entries.js';

const SITE_NAME = 'FAU Erdal Barnehage';
// The same picture, size and description client/index.html declares for the
// site's own preview card.
const IMAGE_PATH = '/og-image.jpg';
const IMAGE_WIDTH = 1280;
const IMAGE_HEIGHT = 853;
const IMAGE_ALT = 'Barn som leker på lekeplass i Erdal barnehage';
const DESCRIPTION_LIMIT = 200;

// Five minutes, so an edited title reaches new previews soon. Vercel's edge
// does cache this page (production answers `x-vercel-cache: HIT` even without
// s-maxage), and that is safe: its cache is keyed on the path after rewriting.
// The crawler rule in vercel.json picks the destination before the cache is
// consulted, so a person asking for the same /kalender?vis= URL is routed to
// index.html and never reaches this entry — checked against production.
export const LINK_PREVIEW_CACHE_CONTROL = 'public, max-age=300';

const CALENDAR_FALLBACK = {
  title: 'Kalender',
  description:
    'Samlet kalender for Erdal Barnehage, uke for uke: arrangementer og møter du kan melde deg på, ukens varmmat, temauker og planleggingsdager.',
  path: '/kalender',
};

const SHARED_ID_RE = /^(event|entry)-([1-9]\d{0,8})$/;

/**
 * `event-12` → { source: 'event', id: 12 }; anything else → null. A rewrite
 * can hand the parameter over twice (captured and passed through), so an
 * array is read by its first value.
 */
export function parseSharedEntryId(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = typeof raw === 'string' ? SHARED_ID_RE.exec(raw) : null;
  if (!match) return null;
  return { source: match[1] === 'event' ? 'event' : 'yearly', id: Number(match[2]) };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(text, limit) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit - 1);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > limit * 0.6 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

function formatDay(date, now) {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

function formatShort(date) {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' }).format(date);
}

/** "lørdag 7. november kl. 18:00" or "Uke 39–41 (21. sep. – 11. okt.)". */
export function describeWhen(entry, now = new Date()) {
  const date = entry.date ? parseCalendarDate(entry.date) : null;
  if (date) {
    const time = entry.startTime
      ? ` kl. ${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ''}`
      : '';
    return `${formatDay(date, now)}${time}`;
  }
  const { start } = isoWeekRange(entry.weekYear, entry.week);
  const { end } = isoWeekRange(entry.weekYear, entry.weekEnd);
  const weeks = entry.weekEnd > entry.week ? `${entry.week}–${entry.weekEnd}` : `${entry.week}`;
  return `Uke ${weeks} (${formatShort(start)} – ${formatShort(end)})`;
}

/** Title, description and path for one normalized calendar entry. */
export function describeEntry(entry, now = new Date()) {
  const facts = [
    entry.cancelled ? 'Avlyst' : '',
    // The feed says the same in its SUMMARY; a title like "Planleggingsdag"
    // does not tell a parent outside the kindergarten that it is closed.
    entry.kind === 'stengt' ? 'Barnehagen er stengt' : '',
    describeWhen(entry, now),
    entry.location,
  ]
    .filter(Boolean)
    .join(' · ');
  const lead = facts.charAt(0).toUpperCase() + facts.slice(1);
  const body = htmlToPlainText(entry.description);
  return {
    title: entry.title,
    description: truncate(body ? `${lead}. ${body}` : lead, DESCRIPTION_LIMIT),
    path: calendarEntryPath(entry.id),
  };
}

/**
 * The preview for a shared id, given the row the handler looked up (already
 * mapped to camelCase), or the calendar's own card when there is no such row
 * — a deleted entry still previews as the calendar its link opens.
 */
export function previewFor(shared, row, now = new Date()) {
  if (!shared || !row) return CALENDAR_FALLBACK;
  const entry = shared.source === 'event' ? normalizeEvent(row, now) : normalizeYearlyEntry(row);
  return entry ? describeEntry(entry, now) : CALENDAR_FALLBACK;
}

export function renderLinkPreview({ title, description, path }, baseUrl) {
  const url = `${baseUrl}${path}`;
  const fullTitle = `${title} – ${SITE_NAME}`;
  const image = `${baseUrl}${IMAGE_PATH}`;
  const e = escapeHtml;
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<title>${e(fullTitle)}</title>
<meta name="description" content="${e(description)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${e(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(SITE_NAME)}">
<meta property="og:locale" content="no_NO">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
<meta property="og:image" content="${e(image)}">
<meta property="og:image:width" content="${IMAGE_WIDTH}">
<meta property="og:image:height" content="${IMAGE_HEIGHT}">
<meta property="og:image:alt" content="${e(IMAGE_ALT)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${e(image)}">
</head>
<body>
<h1>${e(title)}</h1>
<p>${e(description)}</p>
<p><a href="${e(url)}">Åpne i kalenderen</a></p>
</body>
</html>
`;
}
