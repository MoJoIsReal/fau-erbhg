import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeHtml } from '../api/_shared/middleware.js';
import { youtubeEmbedSrc, YOUTUBE_EMBED_HOST } from '../shared/video-embed.js';

const EMBED = `https://${YOUTUBE_EMBED_HOST}/embed/IgVwQOoZm2I`;

test('youtubeEmbedSrc accepts a no-cookie embed url and rebuilds it', () => {
  assert.equal(youtubeEmbedSrc(EMBED), EMBED);
  // Everything but a start offset is dropped: autoplay, referrer and tracking
  // parameters must not survive an author's copy-paste.
  assert.equal(youtubeEmbedSrc(`${EMBED}?rel=0&autoplay=1&origin=https://evil.example`), EMBED);
  assert.equal(youtubeEmbedSrc(`${EMBED}?start=42`), `${EMBED}?start=42`);
  assert.equal(youtubeEmbedSrc(`${EMBED}?start=-5`), EMBED);
  assert.equal(youtubeEmbedSrc(`${EMBED}?start=abc`), EMBED);
});

test('youtubeEmbedSrc rejects every other url', () => {
  // The CSP only allows the no-cookie host, so youtube.com itself would render
  // as a blocked frame.
  assert.equal(youtubeEmbedSrc('https://www.youtube.com/embed/IgVwQOoZm2I'), null);
  assert.equal(youtubeEmbedSrc(`https://${YOUTUBE_EMBED_HOST}.evil.example/embed/x`), null);
  assert.equal(youtubeEmbedSrc(`https://evil.example/${YOUTUBE_EMBED_HOST}/embed/x`), null);
  assert.equal(youtubeEmbedSrc(`http://${YOUTUBE_EMBED_HOST}/embed/IgVwQOoZm2I`), null);
  assert.equal(youtubeEmbedSrc(`https://${YOUTUBE_EMBED_HOST}/watch?v=IgVwQOoZm2I`), null);
  assert.equal(youtubeEmbedSrc(`https://${YOUTUBE_EMBED_HOST}/embed/`), null);
  assert.equal(youtubeEmbedSrc('javascript:alert(1)'), null);
  assert.equal(youtubeEmbedSrc('/embed/IgVwQOoZm2I'), null);
  assert.equal(youtubeEmbedSrc(''), null);
  assert.equal(youtubeEmbedSrc(null), null);
});

test('the sanitizer keeps a YouTube embed and normalizes its attributes', () => {
  // What the editor actually produces: a wrapper div (which is not on the
  // allowlist) around an iframe carrying the extension's own dimensions.
  const stored = sanitizeHtml(
    `<div data-youtube-video=""><iframe width="640" height="360" src="${EMBED}?rel=1"></iframe></div>`,
  );

  assert.match(stored, /^<iframe /);
  assert.equal(stored.includes(`src="${EMBED}"`), true);
  assert.equal(stored.includes('allowfullscreen'), true);
  assert.equal(stored.includes('loading="lazy"'), true);
  assert.equal(stored.includes('width='), false);
  assert.equal(stored.includes('data-youtube-video'), false);

  // Storing the sanitizer's own output again must not change it, or every edit
  // of a post would rewrite its videos.
  assert.equal(sanitizeHtml(stored), stored);
});

test('the sanitizer drops a frame pointing anywhere else', () => {
  assert.equal(sanitizeHtml('<iframe src="https://evil.example/embed/x"></iframe>'), '');
  assert.equal(sanitizeHtml('<iframe src="https://www.youtube.com/embed/IgVwQOoZm2I"></iframe>'), '');
  assert.equal(sanitizeHtml('<iframe src="javascript:alert(1)"></iframe>'), '');
  assert.equal(sanitizeHtml('<iframe></iframe>'), '');
  // The tag goes, and so does anything it was wrapped around.
  assert.equal(sanitizeHtml('<iframe src="https://evil.example/x">fallback</iframe>'), '');
});

test('the sanitizer strips scripting attributes from a frame it keeps', () => {
  const stored = sanitizeHtml(
    `<iframe src="${EMBED}" onload="alert(1)" srcdoc="<script>alert(1)</script>" sandbox="allow-scripts"></iframe>`,
  );

  assert.equal(stored.includes('onload'), false);
  assert.equal(stored.includes('srcdoc'), false);
  assert.equal(stored.includes('sandbox'), false);
  assert.equal(stored.includes(`src="${EMBED}"`), true);
});
