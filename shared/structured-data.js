// What search engines read beyond the visible page: schema.org JSON-LD for an
// event or an article, a description cut from a post's own text, and the
// sitemap of news posts. An event marked up this way can be shown in Google
// with its date and place; an article with its date and author.
//
// Shared because the browser renders the JSON-LD (usePageMeta) and the server
// builds the sitemap (api/secure-settings.js), and both name the same URLs.
import { htmlToPlainText, truncatePlainText } from './html-text.js';
import { calendarEntryPath, eventEntryId } from './calendar-entries.js';
import { osloLocalDateTimeToUtc, toIcsLocalDateTime } from './calendar-feed.js';

export const SITE_NAME = 'FAU Erdal Barnehage';

// KINDERGARTEN_ADDRESS in constants.js, split into the fields schema.org asks for.
const KINDERGARTEN_POSTAL_ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: 'Steinråsa 5',
  postalCode: '5306',
  addressLocality: 'Erdal',
  addressRegion: 'Askøy',
  addressCountry: 'NO',
};

export function organizationJsonLd(baseUrl) {
  return {
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${baseUrl}/`,
    logo: `${baseUrl}/favicon.png`,
  };
}

// Plain text for a meta description: one line, at most `maxLength` characters.
export function plainDescription(html, maxLength = 155) {
  return truncatePlainText(htmlToPlainText(html).replace(/\s+/g, ' '), maxLength);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

// "2026-11-05" + "18:00" → "2026-11-05T18:00:00+01:00": Oslo wall-clock time
// with the offset in force that day, so the result reads as the time on the
// invitation. Without a usable time the event is a whole day.
export function eventStartDate(date, time) {
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(String(date || ''))?.[1];
  if (!day) return null;
  const local = toIcsLocalDateTime(day, String(time || '').trim());
  const utc = local && osloLocalDateTimeToUtc(local);
  if (!utc) return day;
  const [, h, m] = /T(\d{2})(\d{2})/.exec(local);
  const u = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(utc);
  const wallClock = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), Number(h), Number(m));
  const instant = Date.UTC(Number(u[1]), Number(u[2]) - 1, Number(u[3]), Number(u[4]), Number(u[5]));
  const offset = (wallClock - instant) / 60000;
  const sign = offset < 0 ? '-' : '+';
  return `${day}T${h}:${m}:00${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function eventLocation(event, url) {
  if (event.location === 'Digitalt') return { '@type': 'VirtualLocation', url };
  if (event.location === 'Annet' && event.customLocation) {
    return { '@type': 'Place', name: event.customLocation, address: event.customLocation };
  }
  // The other choices are rooms in the kindergarten (event-creation-modal.tsx).
  return { '@type': 'Place', name: 'Erdal barnehage', address: KINDERGARTEN_POSTAL_ADDRESS };
}

export function eventJsonLd(event, baseUrl) {
  const startDate = eventStartDate(event.date, event.time);
  if (!startDate || !event.title) return null;
  const url = `${baseUrl}${calendarEntryPath(eventEntryId(event.id))}`;
  const description = plainDescription(event.description, 500);
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    ...(description ? { description } : {}),
    startDate,
    eventStatus: event.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: event.location === 'Digitalt'
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location: eventLocation(event, url),
    image: [`${baseUrl}/og-calendar.jpg`],
    organizer: organizationJsonLd(baseUrl),
    url,
  };
}

// The events still ahead, cancelled ones included so a search result can say
// so, soonest first.
export function upcomingEventsJsonLd(events, baseUrl, { now = new Date(), limit = 20 } = {}) {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return (events ?? [])
    .filter((event) => (event.status === 'active' || event.status === 'cancelled') && String(event.date).slice(0, 10) >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((event) => eventJsonLd(event, baseUrl))
    .filter(Boolean)
    .slice(0, limit);
}

export function newsPostPath(id) {
  return `/nyheter/${id}`;
}

// The first picture in the post, when it is an absolute https address.
function firstImage(html) {
  const src = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(String(html || ''))?.[1];
  return src && /^https:\/\//.test(src) ? src : null;
}

export function articleJsonLd(post, baseUrl) {
  const url = `${baseUrl}${newsPostPath(post.id)}`;
  const author = post.author && !/^FAU\b/i.test(post.author.trim())
    ? { '@type': 'Person', name: post.author }
    : organizationJsonLd(baseUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: truncatePlainText(post.title, 110),
    description: plainDescription(post.content),
    datePublished: post.publishedDate,
    inLanguage: 'nb',
    author,
    publisher: organizationJsonLd(baseUrl),
    image: [firstImage(post.content) ?? `${baseUrl}/og-home.jpg`],
    mainEntityOfPage: url,
    url,
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// `posts` are { id, publishedDate, updatedAt }. lastmod is the later of the
// two days, so an edited post is fetched again.
export function newsSitemapXml(posts, baseUrl) {
  const urls = (posts ?? []).map((post) => {
    const days = [post.publishedDate, post.updatedAt]
      .map((value) => /^\d{4}-\d{2}-\d{2}/.exec(String(value || ''))?.[0])
      .filter(Boolean)
      .sort();
    const lastmod = days.length ? `\n    <lastmod>${days.at(-1)}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(`${baseUrl}${newsPostPath(post.id)}`)}</loc>${lastmod}\n  </url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
