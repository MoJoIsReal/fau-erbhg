import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { sanitizeHtml } from '../api/_shared/middleware.js';

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
