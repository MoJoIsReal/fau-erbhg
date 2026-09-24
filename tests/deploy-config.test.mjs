// vercel.json and client/index.html have to agree with code that lives far
// away from them. Every drift below fails silently in production — an empty
// video box, a white flash for dark-mode visitors, an uncached feed or a
// broken chunk URL — so the contracts are checked here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sanitizeHtml } from '../api/_shared/middleware.js';
import { YOUTUBE_EMBED_HOST } from '../shared/video-embed.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const vercelConfig = JSON.parse(read('vercel.json'));

function cspDirective(name) {
  const csp = vercelConfig.headers
    ?.flatMap((entry) => entry.headers ?? [])
    .find((header) => header.key === 'Content-Security-Policy');
  assert.ok(csp, 'vercel.json should still set a Content-Security-Policy');
  // Compare sources literally. A regex built from a host would leave its dots
  // unescaped and accept a neighbouring host that merely looks like ours.
  const directive = csp.value
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  assert.ok(directive, `CSP must declare ${name}`);
  return directive.split(/\s+/).slice(1);
}

test('the CSP frames exactly the video host the sanitizer lets through', () => {
  assert.ok(
    cspDirective('frame-src').includes(`https://${YOUTUBE_EMBED_HOST}`),
    `CSP must allow ${YOUTUBE_EMBED_HOST}, the only host the sanitizer keeps as an iframe`,
  );
  assert.match(sanitizeHtml(`<iframe src="https://${YOUTUBE_EMBED_HOST}/embed/IgVwQOoZm2I"></iframe>`), /^<iframe /);
  assert.match(
    read('client/src/components/safe-html.tsx'),
    /youtubeEmbedSrc/,
    'SafeHtml must validate frame sources with the same shared helper as the server',
  );
});

test('script-src carries exactly the hash of the inline theme script', () => {
  const html = read('client/index.html');
  // The one executable inline script is the pre-paint theme switch; ld+json
  // blocks are data, not script.
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].filter(
    ([, attrs]) => !/type\s*=\s*["']application\/ld\+json["']/.test(attrs),
  );
  assert.equal(inline.length, 1, 'client/index.html should carry exactly one executable inline script');
  const [, , body] = inline[0];
  assert.match(body, /prefers-color-scheme/);
  assert.match(body, /classList\.toggle\("dark"/);

  const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
  const hashes = cspDirective('script-src').filter((source) => source.startsWith("'sha256-"));
  assert.deepEqual(hashes, [hash], 'Re-hash the theme script after editing it, and drop stale hashes');
});

// PERF-003. /kalender.ics is polled by every subscribed calendar client. Header
// rules in vercel.json match the PRE-rewrite path, so `/api/(.*)` never sees
// /kalender.ics — the cache header has to come from the handler.
test('the calendar feed sets its own shared-cache lifetime; other API routes stay no-store', () => {
  const eventsApi = read('api/events.js');
  assert.match(
    eventsApi,
    /export const CALENDAR_FEED_CACHE_CONTROL\s*=\s*\n?\s*'public, max-age=\d+, s-maxage=\d+, stale-while-revalidate=\d+'/,
  );
  const feedStart = eventsApi.indexOf('async function respondWithCalendarFeed');
  assert.ok(feedStart !== -1, 'The ICS feed should live in respondWithCalendarFeed');
  assert.match(
    eventsApi.slice(feedStart, eventsApi.indexOf('\n}', feedStart)),
    /setHeader\('Cache-Control', CALENDAR_FEED_CACHE_CONTROL\)/,
  );

  const apiRule = vercelConfig.headers.find((rule) => rule.source === '/api/(.*)');
  assert.ok(apiRule, 'The API routes should still be no-store by default');
  assert.match(apiRule.headers.find((header) => header.key === 'Cache-Control').value, /no-store/);
});

// A tab left open across a deploy asks for hashed chunks the new build no
// longer has. Rewriting /assets/* to index.html served HTML as JS and, because
// header rules match the pre-rewrite path, cached it as immutable for a year.
test('a missing /assets/ file 404s instead of being rewritten to the SPA', () => {
  const spaRule = vercelConfig.rewrites.find((rule) => rule.destination === '/index.html');
  assert.ok(spaRule, 'vercel.json should still rewrite client routes to index.html');
  const pattern = new RegExp(`^${spaRule.source}$`);
  assert.ok(pattern.test('/kalender'));
  assert.ok(!pattern.test('/assets/messages-DejWTZW2.js'));
  assert.match(read('client/src/main.tsx'), /vite:preloadError/, 'The client should reload on a stale chunk');
});
