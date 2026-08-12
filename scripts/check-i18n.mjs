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
const BUDGET = 46;

const PATTERN = /language === (['"])no\1 \?/g;

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

for (const file of walk(ROOT)) {
  const hits = (readFileSync(file, 'utf8').match(PATTERN) ?? []).length;
  if (hits > 0) {
    counts.push([hits, file]);
    total += hits;
  }
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
