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
//   * Known: everything else must match BASELINE below, one entry per
//     diagnostic, by file, code and message (not line, so an edit elsewhere in
//     the file does not disturb it). A count let a new real error in while an
//     unrelated one was fixed; a fingerprint does not. Fix an entry and remove
//     it; never add one to make the check pass.
//
// shared/schema.ts is skipped: the .d.ts files import its types, which pulls
// it into this program, and under its strict:false drizzle-zod's .omit()
// types collapse into dozens of "true is not assignable to never". The root
// `tsc` already checks schema.ts under strict, where it is clean.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// TS2304 "Cannot find name 'X'" / TS2552 "Cannot find name 'X'. Did you mean…"
const FATAL_CODES = new Set(['TS2304', 'TS2552']);

// The diagnostics that remain, and why each is not a defect. The four below
// are artifacts of strict:false: without strictNullChecks, TypeScript does not
// narrow a union on an `ok: true | false` discriminant, so reading `.error`
// after `if (!result.ok)` is reported although it is correct.
const BASELINE = [
  "api/yearly-calendar.js TS2339 Property 'error' does not exist on type 'ImportDecisionValidationResult'.",
  "api/yearly-calendar.js TS2339 Property 'error' does not exist on type 'ImportDecisionValidationResult'.",
  "api/yearly-calendar.js TS2339 Property 'errors' does not exist on type 'YearlyCalendarImportValidationResult'.",
  "api/yearly-calendar.js TS2339 Property 'payload' does not exist on type 'YearlyCalendarImportValidationResult'.",
];

const IGNORED_FILES = new Set(['shared/schema.ts']);

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
const found = [];
let ignored = 0;
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
  const path = file.replaceAll('\\', '/');
  if (FATAL_CODES.has(code)) fatal.push(`  ${path}:${lineNo}:${col}  ${code}: ${message}`);
  else if (IGNORED_FILES.has(path)) ignored += 1;
  else found.push({ fingerprint: `${path} ${code} ${message}`, where: `${path}:${lineNo}:${col}` });
}

if (unexpected.length || (failed && fatal.length + found.length + ignored === 0)) {
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

// Match each diagnostic against one unused baseline entry.
const remaining = [...BASELINE];
const unknown = [];
for (const diagnostic of found) {
  const index = remaining.indexOf(diagnostic.fingerprint);
  if (index === -1) unknown.push(diagnostic);
  else remaining.splice(index, 1);
}

if (unknown.length > 0) {
  console.error(`\nbackend types: ${unknown.length} new diagnostic(s) in api/ or shared/.\n`);
  for (const { where, fingerprint } of unknown) console.error(`  ${where}  ${fingerprint.slice(fingerprint.indexOf(' ') + 1)}`);
  console.error('\nFix them. Do not add them to BASELINE in scripts/check-backend-types.mjs.\n');
  process.exit(1);
}

if (remaining.length > 0) {
  console.log(`backend types: 0 undefined identifiers, ${found.length} known diagnostic(s); ${remaining.length} baseline entr${remaining.length === 1 ? 'y is' : 'ies are'} fixed:`);
  for (const fingerprint of remaining) console.log(`  ${fingerprint}`);
  console.log('Remove them from BASELINE in scripts/check-backend-types.mjs to lock in the improvement.');
} else {
  console.log(`backend types: 0 undefined identifiers, ${found.length} known diagnostic(s), matching the baseline.`);
}
