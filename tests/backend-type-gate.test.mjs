import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

function runCompiler({ output = '', status = 0, signal = null } = {}) {
  const source = readFileSync(new URL('../scripts/check-backend-types.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(new URL('../scripts/check-backend-types.mjs', import.meta.url).href));
  let invocation;
  let code = 0;
  const exit = new Error('exit');
  try {
    vm.runInNewContext(source, {
      createRequire, URL,
      execFileSync(command, args) {
        invocation = { command, args };
        if (status !== 0 || signal) throw Object.assign(new Error('compiler failed'), { stdout: output, stderr: '', status, signal });
        return output;
      },
      console: { log() {}, error() {} },
      process: { execPath: process.execPath, exit(value) { code = value; throw exit; } },
    });
  } catch (error) { if (error !== exit) throw error; }
  return { code, invocation };
}

test('launches the installed compiler through Node, without a platform shell', () => {
  const { code, invocation } = runCompiler();
  assert.equal(code, 0);
  assert.equal(invocation.command, process.execPath);
  assert.match(invocation.args[0], /typescript[\\/]bin[\\/]tsc$/);
  assert.ok(invocation.args.includes('--pretty'));
});

test('rejects global errors, unexplained failures, and interrupted compilers', () => {
  for (const output of ['error TS5083: Cannot read file.', 'unexpected compiler failure', '']) {
    assert.equal(runCompiler({ output, status: 1 }).code, 1, output);
  }
  assert.equal(runCompiler({ output: 'api/a.js(1,1): error TS2345: old error', status: null, signal: 'SIGTERM' }).code, 1);
});

// A known diagnostic, word for word as BASELINE in the script lists it.
const KNOWN = "api/yearly-calendar.js(286,68): error TS2339: Property 'error' does not exist on type 'ImportDecisionValidationResult'.";

test('known diagnostics pass; a new one fails, even when another was fixed', () => {
  assert.equal(runCompiler({ output: `${KNOWN}\n  Details of the diagnostic.`, status: 2 }).code, 0);
  assert.equal(runCompiler({ output: KNOWN.replace('(286,68)', '(300,1)'), status: 2 }).code, 0, 'a line number is not part of it');
  const fresh = 'api/a.js(1,1): error TS2345: Argument of type string is not assignable';
  assert.equal(runCompiler({ output: fresh, status: 2 }).code, 1);
  // Today's output passes; the same count with one fixed and one new fails.
  const today = [
    KNOWN, KNOWN.replace('(286,68)', '(309,48)'),
    "api/yearly-calendar.js(312,37): error TS2339: Property 'errors' does not exist on type 'YearlyCalendarImportValidationResult'.",
    "api/yearly-calendar.js(329,38): error TS2339: Property 'payload' does not exist on type 'YearlyCalendarImportValidationResult'.",
  ];
  assert.equal(runCompiler({ output: today.join('\n'), status: 2 }).code, 0);
  assert.equal(runCompiler({ output: [...today.slice(1), fresh].join('\n'), status: 2 }).code, 1);
  assert.equal(runCompiler({ output: [KNOWN, KNOWN, KNOWN].join('\n'), status: 2 }).code, 1, 'it is known twice, not three times');
  for (const type of ['TS2304', 'TS2552']) {
    assert.equal(runCompiler({ output: `api/a.js(1,1): error ${type}: Undefined name`, status: 2 }).code, 1);
  }
  assert.equal(runCompiler({ output: `${KNOWN}\nerror TS5083: Cannot read file.`, status: 2 }).code, 1);
});

test('shared/schema.ts is left to the strict root program', () => {
  const schema = "shared/schema.ts(396,68): error TS2322: Type 'true' is not assignable to type 'never'.";
  assert.equal(runCompiler({ output: Array(30).fill(schema).join('\n'), status: 2 }).code, 0);
});
