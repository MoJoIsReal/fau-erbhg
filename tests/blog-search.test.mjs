import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { blogSearchPattern } from '../api/secure-settings.js';

test('blog search treats an absent or blank query as no filter', () => {
  for (const input of [undefined, null, '', '   ', ['dugnad'], 42]) {
    assert.equal(blogSearchPattern(input), null);
  }
});

test('blog search trims and bounds input while preserving Norwegian text', () => {
  assert.equal(blogSearchPattern('  Høstdugnad på øya  '), '%Høstdugnad på øya%');
  assert.equal(blogSearchPattern('x'.repeat(1000)), `%${'x'.repeat(200)}%`);
});

test('blog search treats SQL wildcard characters as literal user text', () => {
  assert.equal(blogSearchPattern('100%_\\'), '%100\\%\\_\\\\%');
  assert.equal(blogSearchPattern("foreldrenes 'tips'"), "%foreldrenes 'tips'%");
});

test('blog search filters published titles and body text before applying pagination', () => {
  const source = readFileSync(new URL('../api/secure-settings.js', import.meta.url), 'utf8');
  const query = source.match(/\/\/ Public view - only show published posts[\s\S]*?posts = await sql`([\s\S]*?)`;/)?.[1];
  assert.ok(query, 'Find the public blog query');
  assert.match(query, /WHERE status = 'published'/);
  assert.match(query, /category = \$\{sanitizedCategory\}/);
  assert.match(query, /title ILIKE \$\{searchPattern\}/);
  assert.match(query, /regexp_replace\(content,[\s\S]*?ILIKE \$\{searchPattern\}/);
  assert.ok(query.indexOf('ILIKE') < query.indexOf('LIMIT'), 'Search must include older posts beyond the first page');
});
