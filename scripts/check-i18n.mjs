#!/usr/bin/env node
// Ratchet on inline translations.
//
// User-facing copy belongs in client/src/lib/i18n.ts, where the typed
// Translations interface forces every string to exist in both languages. Copy
// written inline as `language === 'no' ? "…" : "…"` bypasses that, so the
// English side rots without anyone noticing — which is exactly what had
// happened across 25 files before this check existed.
//
// A hard zero is not reachable: locale identifiers ("no-NO" / "en-US"),
// document lang attributes and date-fns locale objects legitimately branch on
// language. So this enforces a budget instead. The number may fall, never
// rise. Lower BUDGET whenever you migrate more.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'client/src';
const BUDGET = 58;

// Whitespace-tolerant: `language === 'no'` with the `?` on the next line is
// the same branch.
const PATTERN = /language\s*===\s*(['"])no\1\s*\?/g;

// The second ratchet: Norwegian written straight into a component, with no
// branch at all. The public signup dialog showed "Antall deltakere" and
// "Avbryt" to English readers, and the ternary count above could not see it.
// A string or JSX text holding æ, ø or å outside i18n.ts is Norwegian copy
// (or a data value, such as a room name, which the budget allows for).
// Comments are skipped.
const NORWEGIAN_BUDGET = 58;
const NORWEGIAN_TEXT = /(["'`])(?:(?!\1)[^\\\n])*[æøåÆØÅ](?:(?!\1)[^\\\n])*\1|>[^<>{}]*[æøåÆØÅ][^<>{}]*</g;
const withoutComments = (source) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\s\/\/ .*$/gm, '');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // shadcn/ui primitives are vendored and carry no copy of ours.
      if (entry === 'ui') continue;
      out.push(...walk(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const counts = [];
let total = 0;
const norwegian = [];
let norwegianTotal = 0;

for (const file of walk(ROOT)) {
  const source = readFileSync(file, 'utf8');
  const hits = (source.match(PATTERN) ?? []).length;
  if (hits > 0) {
    counts.push([hits, file]);
    total += hits;
  }
  if (file.endsWith('i18n.ts')) continue;
  const texts = withoutComments(source).match(NORWEGIAN_TEXT) ?? [];
  if (texts.length > 0) {
    norwegian.push([texts.length, file]);
    norwegianTotal += texts.length;
  }
}

norwegian.sort((a, b) => b[0] - a[0]);
if (norwegianTotal > NORWEGIAN_BUDGET) {
  console.error(`\ni18n: ${norwegianTotal} Norwegian strings outside i18n.ts, budget is ${NORWEGIAN_BUDGET}.\n`);
  for (const [count, file] of norwegian) console.error(`  ${String(count).padStart(3)}  ${file}`);
  console.error('\nMove the copy into client/src/lib/i18n.ts, in both languages.\n');
  process.exit(1);
}

counts.sort((a, b) => b[0] - a[0]);

if (total > BUDGET) {
  console.error(`\ni18n: ${total} inline language ternaries, budget is ${BUDGET}.\n`);
  for (const [hits, file] of counts) console.error(`  ${String(hits).padStart(3)}  ${file}`);
  console.error(
    '\nMove user-facing copy into client/src/lib/i18n.ts and read it via t.<namespace>.<key>.',
  );
  console.error('If the new branch is genuinely not copy (a locale id, a date-fns locale),');
  console.error('raise BUDGET in scripts/check-i18n.mjs and say why in the commit message.\n');
  process.exit(1);
}

if (total < BUDGET) {
  console.log(`i18n: ${total} inline ternaries, under the budget of ${BUDGET}.`);
  console.log('Lower BUDGET in scripts/check-i18n.mjs to lock in the improvement.');
} else {
  console.log(`i18n: ${total} inline ternaries, at budget.`);
}
if (norwegianTotal < NORWEGIAN_BUDGET) {
  console.log(`i18n: ${norwegianTotal} Norwegian strings outside i18n.ts, under the budget of ${NORWEGIAN_BUDGET}; lower NORWEGIAN_BUDGET.`);
} else {
  console.log(`i18n: ${norwegianTotal} Norwegian strings outside i18n.ts, at budget.`);
}
