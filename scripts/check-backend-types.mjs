#!/usr/bin/env node
// Ratchet on backend type diagnostics, with zero tolerance for undefined names.
//
// api/ and shared/ are plain .js by design (AGENTS.md: api/ runs unbundled), so
// the root tsconfig sets checkJs:false and `tsc` reports nothing about them.
// There is no ESLint either. That left NO tool in this repo able to see an
// undefined identifier in the backend — which is how `Sentry` and
// `reportProviderError` were referenced in api/cron/event-reminders.js without
// ever being imported. Both sat in error-only branches, so the module imported
// cleanly, every test passed, and the first failed email in production threw a
// ReferenceError that aborted the whole cron run.
//
// tsconfig.api.json turns checkJs on for those files. A hard zero across all
// diagnostics is not reachable today: untyped JS handed to typed libraries
// (nodemailer, jsonwebtoken) produces a tail of pre-existing signature
// complaints that are not bugs. So this splits the difference:
//
//   * FATAL, always: the undefined-name codes. That is the bug class above and
//     it is always a real defect, never a typing artifact.
//   * Ratcheted: everything else, against OTHER_BUDGET. The number may fall,
//     never rise — same contract as scripts/check-i18n.mjs.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// TS2304 "Cannot find name 'X'" / TS2552 "Cannot find name 'X'. Did you mean…"
const FATAL_CODES = new Set(['TS2304', 'TS2552']);

// Pre-existing signature/JSDoc diagnostics at the time this check was added.
// Lower this whenever you clear some. Do not raise it.
const OTHER_BUDGET = 50;

const DIAGNOSTIC = /^(\S.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

let output = '';
let failed = false;
try {
  const require = createRequire(import.meta.url);
  const compiler = require.resolve('typescript/package.json').replace(/package\.json$/, 'bin/tsc');
  output = execFileSync(process.execPath, [compiler, '-p', 'tsconfig.api.json', '--noEmit', '--pretty', 'false'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  failed = true;
  // tsc exits non-zero when it reports diagnostics; that is the normal path here.
  output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  if (!output.trim() || error.signal || !Number.isInteger(error.status)) {
    console.error('backend types: tsc failed without producing diagnostics.\n');
    console.error(error.message);
    process.exit(1);
  }
}

const fatal = [];
let other = 0;
const unexpected = [];

for (const line of output.split('\n')) {
  const match = DIAGNOSTIC.exec(line);
  if (!match) {
    // tsc's multiline diagnostic details are indented. Global errors and
    // unexplained output must never be mistaken for a successful zero count.
    if (line.trim() && (!/^\s/.test(line) || /^\s*error TS\d+:/.test(line))) unexpected.push(line);
    continue;
  }
  const [, file, lineNo, col, code, message] = match;
  if (FATAL_CODES.has(code)) fatal.push(`  ${file}:${lineNo}:${col}  ${code}: ${message}`);
  else other += 1;
}

if (unexpected.length || (failed && fatal.length + other === 0)) {
  console.error('backend types: unrecognized compiler failure or global diagnostic.');
  console.error(output.trim());
  process.exit(1);
}

if (fatal.length > 0) {
  console.error(`\nbackend types: ${fatal.length} undefined identifier(s) in api/ or shared/.\n`);
  for (const entry of fatal) console.error(entry);
  console.error('\nThese are always real: the name is used but never imported or declared.');
  console.error('Add the missing import. Do not silence this check.\n');
  process.exit(1);
}

if (other > OTHER_BUDGET) {
  console.error(`\nbackend types: ${other} other diagnostics, budget is ${OTHER_BUDGET}.\n`);
  console.error(output.trim());
  console.error('\nFix the new diagnostic. Do not raise OTHER_BUDGET.\n');
  process.exit(1);
}

if (other < OTHER_BUDGET) {
  console.log(`backend types: 0 undefined identifiers, ${other} other diagnostics (budget ${OTHER_BUDGET}).`);
  console.log('Lower OTHER_BUDGET in scripts/check-backend-types.mjs to lock in the improvement.');
} else {
  console.log(`backend types: 0 undefined identifiers, ${other} other diagnostics, at budget.`);
}
