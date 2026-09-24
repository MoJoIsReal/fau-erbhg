import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  sanitizeEmail,
  sanitizeHtml,
  sanitizeNumber,
  sanitizePhone,
  sanitizeText,
} from '../api/_shared/middleware.js';
import { htmlToPlainText } from '../shared/html-text.js';

const require = createRequire(import.meta.url);

// Resolve htmlparser2 the way sanitize-html itself does, then find the
// package.json of whatever copy that resolution landed on.
function resolvedHtmlparser2Manifest() {
  const sanitizeHtmlEntry = require.resolve('sanitize-html');
  const fromSanitizeHtml = createRequire(sanitizeHtmlEntry);
  let dir = dirname(fromSanitizeHtml.resolve('htmlparser2'));

  for (let depth = 0; depth < 10; depth += 1) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (manifest.name === 'htmlparser2') return manifest;
    } catch {
      // Keep walking up: the entry point usually sits a few directories deep.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error('could not locate the htmlparser2 package.json');
}

// The whole API is CommonJS as far as Vercel's serverless loader is concerned,
// and that loader cannot require() an ES module. sanitize-html 2.17.6 moved to
// htmlparser2 12, which dropped its CommonJS build, and every function in the
// project died at import with ERR_REQUIRE_ESM until an override pinned the
// parser back to a dual-build release. Node itself has allowed require(ESM)
// since 22.12, so loading the module here proves nothing on its own — the
// packaging is what has to hold.
test('sanitize-html resolves an htmlparser2 that still ships a CommonJS build', () => {
  const manifest = resolvedHtmlparser2Manifest();
  const mainExport = manifest.exports?.['.'];
  const hasRequireCondition = Boolean(mainExport && typeof mainExport === 'object' && mainExport.require);
  const isCommonJsPackage = manifest.type !== 'module';

  assert.equal(
    hasRequireCondition || isCommonJsPackage,
    true,
    `htmlparser2 ${manifest.version} is ESM-only, so Vercel's loader cannot require() it — `
    + 'keep the sanitize-html override on a dual-build release',
  );
});

test('sanitize-html loads through a CommonJS require, as the bundled functions do', () => {
  assert.equal(typeof require('sanitize-html'), 'function');
});

test('the sanitizer still strips scripts, javascript: URLs and event handlers', () => {
  assert.equal(sanitizeHtml('<p>ok</p><script>alert(1)</script>'), '<p>ok</p>');
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>').includes('javascript:'), false);
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>').includes('onerror'), false);
  assert.equal(sanitizeHtml('<p>Blåbærsyltetøy &amp; kake</p>'), '<p>Blåbærsyltetøy &amp; kake</p>');
  for (const payload of ['<svg/onload=alert(1)>', '<a href="java&#x73;cript:alert(1)">encoded</a>']) {
    assert.doesNotMatch(sanitizeHtml(payload), /onload|javascript:|<svg/i, payload);
  }
});

test('links keep their href and always open safely in a new tab', () => {
  assert.equal(
    sanitizeHtml('<a href="https://example.com">ok</a>'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>',
  );
});

// Both were fixed in sanitize-html 2.17.6/2.17.7. Pinning the parser back must
// not quietly cost us those fixes, and neither must a future downgrade.
test('the sanitize-html XSS fixes this version shipped are still in force', () => {
  const sanitizeHtmlContent = require('sanitize-html');

  // GHSA-jxwj-j7wr-gfrw: a literal `</textarea/>` used to survive into the
  // output, where a browser re-parsing it would reopen a tag.
  const textarea = sanitizeHtmlContent(
    '<textarea></textarea/><img src=x onerror=alert(1)></textarea>',
    { allowedTags: ['textarea'], disallowedTagsMode: 'discard' },
  );
  assert.equal(/<(?!\/?textarea)/i.test(textarea), false);

  // GHSA-g8qq-57p8-ggw5: SMIL animation of a URL attribute smuggled a
  // javascript: destination past the scheme policy via the values list.
  const smil = sanitizeHtmlContent(
    '<svg><a href="#x"><animate attributeName="href" values="#safe;javascript:alert(1)"/></a></svg>',
    {
      allowedTags: ['svg', 'a', 'animate'],
      allowedAttributes: { a: ['href'], animate: ['attributeName', 'values'] },
    },
  );
  assert.equal(smil.includes('animate'), false);
  assert.equal(smil.includes('javascript:'), false);
});

// CodeQL flagged the single-pass replaces here: cutting "javascript:" out once
// rebuilt it from the text around the hole. sanitizeText is defense in depth,
// not the XSS boundary, but it must never assemble a scheme that was not
// already there.
test('sanitizeText cannot be tricked into assembling a scripting scheme', () => {
  const scheme = /(?<![\w.-])(?:javascript|vbscript|data)\s*:/i;

  assert.equal(scheme.test(sanitizeText('javajavascript:script:alert(1)')), false);
  assert.equal(scheme.test(sanitizeText('java<>script:alert(1)')), false);
  assert.equal(scheme.test(sanitizeText('data:text/html;base64,PHNjcmlwdD4=')), false);
  assert.equal(scheme.test(sanitizeText('VBScript:msgbox(1)')), false);
});

// The scheme strip runs on free-text fields too, so it may only fire where a
// URL could actually start.
test('sanitizeText leaves ordinary Norwegian prose alone', () => {
  assert.equal(sanitizeText('Kontaktdata: 12345'), 'Kontaktdata: 12345');
  assert.equal(sanitizeText('Blåbærsyltetøy og kake på dugnaden'), 'Blåbærsyltetøy og kake på dugnaden');
  assert.equal(
    sanitizeText('https://res.cloudinary.com/demo/image/upload/v1/fau-documents/a.pdf'),
    'https://res.cloudinary.com/demo/image/upload/v1/fau-documents/a.pdf',
  );
});

// Decoding &amp; before &lt; unescaped the same text twice: an author writing
// the literal characters "&lt;" got a real "<" in the email and the ICS feed.
test('htmlToPlainText decodes each entity exactly once', () => {
  assert.equal(htmlToPlainText('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
  assert.equal(htmlToPlainText('<p>Hei &amp; ha det</p><p>Neste</p>'), 'Hei & ha det\n\nNeste');
  assert.equal(htmlToPlainText('Tekst med &lt;tag&gt;'), 'Tekst med <tag>');
});

test('htmlToPlainText strips nested tag remnants instead of splicing a new tag', () => {
  assert.equal(htmlToPlainText('<scr<b>ipt>alert(1)</scr</b>ipt>').includes('<script>'), false);
  assert.equal(htmlToPlainText('<p>Klippet midt i en ta'), 'Klippet midt i en ta');
});

// `on\w+\s*=\s*["'][^"']*["']` had no `=` to anchor on, so on a run of "ondata"
// the engine started at each "on", let `\w+` consume the remainder, then
// backtracked one character at a time. That is quadratic: 256 KB took 11 s.
// The cap did not help, because the old sanitizeText truncated only at the end,
// after both regex passes had already scanned the whole request body.
// api/contact.js reaches this unauthenticated and (before this was fixed) did
// so before rate limiting, so one request could burn the whole 30 s
// function budget in vercel.json.
test('sanitizeText does not backtrack quadratically on a long handler-like run', () => {
  const payload = 'ondata'.repeat(100_000); // ~600 KB, larger than any real field
  const startedAt = process.hrtime.bigint();
  sanitizeText(payload, 5000);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  // Pre-fix this was ~45 s. The bound makes it independent of input length, so
  // 50 ms is generous even on a slow CI runner.
  assert.ok(elapsedMs < 50, `sanitizeText took ${elapsedMs.toFixed(0)} ms on a ${payload.length}-char input`);
});

test('sanitizeText cost does not grow with input beyond the bound', () => {
  const time = (chars) => {
    const input = 'ondata'.repeat(chars / 6);
    const startedAt = process.hrtime.bigint();
    sanitizeText(input, 5000);
    return Number(process.hrtime.bigint() - startedAt) / 1e6;
  };
  time(32 * 1024); // warm up, so the first call's JIT cost is not attributed below
  const small = time(32 * 1024);
  const large = time(256 * 1024);

  // Quadratic growth would be ~64x here. Allow a wide margin for timer noise on
  // sub-millisecond measurements; anything near quadratic blows straight past it.
  assert.ok(large < small * 8 + 20, `32KB took ${small.toFixed(2)} ms but 256KB took ${large.toFixed(2)} ms`);
});

test('sanitizeText still enforces maxLength and keeps Norwegian prose intact', () => {
  assert.equal(sanitizeText('a'.repeat(5000), 100).length, 100);
  assert.equal(sanitizeText('Vi møtes kl. 18:30 i gymsalen.'), 'Vi møtes kl. 18:30 i gymsalen.');
  assert.equal(sanitizeText('Hei, æøå ÆØÅ — helt vanlig tekst!'), 'Hei, æøå ÆØÅ — helt vanlig tekst!');
  assert.equal(sanitizeText('onerror="alert(1)" hei'), 'hei');
});

test('sanitizeEmail normalizes a valid address and rejects anything else', () => {
  assert.equal(sanitizeEmail('  Kari.Nordmann+fau@Example.NO '), 'kari.nordmann+fau@example.no');
  for (const bad of ['', null, 42, 'kari', 'kari@', 'kari@example', 'a b@example.no', 'kari@example.no\nBcc: x@y.no']) {
    assert.equal(sanitizeEmail(bad), null, JSON.stringify(bad));
  }
});

test('sanitizePhone keeps dialling characters only and caps the length', () => {
  assert.equal(sanitizePhone('+47 (999) 88-777'), '+47 (999) 88-777');
  assert.equal(sanitizePhone('999<script>88777'), '99988777');
  assert.equal(sanitizePhone('1'.repeat(40)).length, 20);
  assert.equal(sanitizePhone(null), '');
});

test('sanitizeNumber returns null outside the bounds or for non-numbers', () => {
  assert.equal(sanitizeNumber('3', 1, 10), 3);
  assert.equal(sanitizeNumber('0', 1, 10), null);
  assert.equal(sanitizeNumber('11', 1, 10), null);
  assert.equal(sanitizeNumber('abc'), null);
});
