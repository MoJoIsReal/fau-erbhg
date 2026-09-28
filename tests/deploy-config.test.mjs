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

// PERF-003. /kalender.ics is polled by every subscribed calendar client, but
// header rules in vercel.json match the PRE-rewrite path, so `/api/(.*)` never
// sees it: the feed sets its own cache header (checked in events-handler).
// Everything else under /api stays uncached.
test('API routes default to no-store', () => {
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

// The Turnstile widget on the public forms loads its script from Cloudflare and
// runs its challenge in a Cloudflare iframe. If the CSP blocks either, the
// widget silently never appears and — once the secret is set — every public
// form is refused for lack of a token.
test('the CSP lets the Turnstile widget load its script and its frame', () => {
  const widget = read('client/src/components/turnstile-widget.tsx');
  const [, origin] = widget.match(/"(https:\/\/challenges\.cloudflare\.com)\/turnstile\/v0\/api\.js/) ?? [];
  assert.equal(origin, 'https://challenges.cloudflare.com', 'the widget loads Turnstile from Cloudflare');
  assert.ok(cspDirective('script-src').includes(origin), `script-src must allow ${origin}`);
  assert.ok(cspDirective('frame-src').includes(origin), `frame-src must allow ${origin}`);
});

// ---------------------------------------------------------------------------
// Private media shares (docs/mediedeling.md). The share page shows children,
// so every one of these failing would leak something without an error.

const NOINDEX = 'noindex, nofollow, noarchive';
const R2_ORIGIN = 'https://*.r2.cloudflarestorage.com';
const headerRule = (source) => vercelConfig.headers.find((rule) => rule.source === source);
const headerValue = (rule, key) => rule?.headers.find((header) => header.key === key)?.value;
const matches = (source, path) => new RegExp(`^${source}$`).test(path);
const shareRule = headerRule('/(del|del\\.html)');

test('/del is served by its own page, not the main app', () => {
  const index = vercelConfig.rewrites.findIndex((rule) => rule.source === '/del');
  const spa = vercelConfig.rewrites.findIndex((rule) => rule.destination === '/index.html');
  assert.ok(index >= 0 && vercelConfig.rewrites[index].destination === '/del.html', '/del must rewrite to /del.html');
  assert.ok(index < spa, 'the /del rewrite must come before the SPA fallback');
  assert.match(read('vite.config.ts'), /del: path\.resolve\(import\.meta\.dirname, "client", "del\.html"\)/,
    'del.html must be a Vite build input');
});

test('the share page gets its own headers and none of the site-wide set', () => {
  const global = vercelConfig.headers[0];
  for (const path of ['/del', '/del.html']) {
    assert.ok(!matches(global.source, path), `the site-wide headers must not apply to ${path}`);
    assert.ok(matches(shareRule.source, path), `the share headers must apply to ${path}`);
  }
  for (const path of ['/', '/kalender', '/admin', '/delta', '/del/x']) {
    assert.ok(matches(global.source, path), `the site-wide headers must still cover ${path}`);
  }
  assert.equal(headerValue(shareRule, 'Referrer-Policy'), 'no-referrer');
  assert.equal(headerValue(shareRule, 'X-Robots-Tag'), NOINDEX);
  assert.equal(headerValue(shareRule, 'X-Frame-Options'), 'DENY');
  assert.equal(headerValue(shareRule, 'X-Content-Type-Options'), 'nosniff');
  assert.match(headerValue(shareRule, 'Strict-Transport-Security'), /max-age=\d+/);
});

test('the share page CSP allows our origin and R2, and no third party at all', () => {
  const csp = headerValue(shareRule, 'Content-Security-Policy');
  const directives = Object.fromEntries(csp.split(';').map((part) => part.trim()).filter(Boolean)
    .map((part) => { const [name, ...sources] = part.split(/\s+/); return [name, sources]; }));
  const allowed = new Set(["'self'", "'none'", "'unsafe-inline'", 'data:', 'blob:', R2_ORIGIN]);
  for (const [name, sources] of Object.entries(directives)) {
    for (const source of sources) {
      assert.ok(allowed.has(source) || /^'sha256-[A-Za-z0-9+/=]+'$/.test(source), `${name} must not allow ${source}`);
    }
  }
  assert.deepEqual(directives['default-src'], ["'none'"]);
  assert.deepEqual(directives['connect-src'], ["'self'"], 'the page talks to our API only');
  assert.ok(directives['media-src'].includes(R2_ORIGIN), 'video and audio play from R2');
  assert.ok(directives['img-src'].includes(R2_ORIGIN), 'photos load from R2');
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);

  // The inline theme script is the same as index.html's, so one hash covers both.
  const html = read('client/del.html');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1, 'del.html should carry exactly one inline script');
  const hash = `'sha256-${createHash('sha256').update(inline[0][1], 'utf8').digest('base64')}'`;
  assert.deepEqual(directives['script-src'], ["'self'", hash]);
});

test('del.html says noindex and no-referrer itself and loads nothing from elsewhere', () => {
  const html = read('client/del.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive" \/>/);
  assert.match(html, /<meta name="referrer" content="no-referrer" \/>/);
  const urls = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(([, url]) => url);
  assert.deepEqual(urls.filter((url) => !url.startsWith('/')), [], 'only same-origin resources');
  assert.ok(urls.includes('/src/share/main.tsx'));
});

test('the share page bundle pulls in no analytics, no Sentry and no Google Fonts', async () => {
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: ['client/src/share/main.tsx'],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
    external: ['*.css'],
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some((input) => input.includes('client/src/share/share-page.tsx')), 'the bundle was actually built');
  for (const banned of ['@sentry', '@vercel/analytics', 'components/ErrorBoundary', 'telemetry-privacy']) {
    assert.deepEqual(inputs.filter((input) => input.includes(banned)), [], `${banned} must not reach the share page`);
  }
  const css = read('client/src/share/share.css');
  assert.ok(!/https?:\/\//.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'fonts come from our own origin');
});

test('admin pages and API answers carry noindex, and robots.txt keeps crawlers out', () => {
  assert.equal(headerValue(headerRule('/api/(.*)'), 'X-Robots-Tag'), NOINDEX);
  const admin = headerRule('/admin(.*)');
  assert.equal(headerValue(admin, 'X-Robots-Tag'), NOINDEX);
  assert.ok(matches(admin.source, '/admin') && matches(admin.source, '/admin/media'));

  const robots = read('client/public/robots.txt');
  assert.match(robots, /^Disallow: \/del$/m);
  assert.match(robots, /^Disallow: \/admin$/m);
  assert.ok(!read('client/public/sitemap.xml').includes('/del'), 'the sitemap never lists a share');
});

test('the admin page may upload straight to R2', () => {
  assert.ok(cspDirective('connect-src').includes(R2_ORIGIN), 'connect-src must allow presigned R2 uploads');
});
