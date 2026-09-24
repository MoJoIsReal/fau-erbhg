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

test('retains the diagnostic ratchet and zero tolerance for undefined identifiers', () => {
  const diagnostic = 'api/a.js(1,1): error TS2345: Existing signature error\n  Details of the signature.';
  assert.equal(runCompiler({ output: diagnostic, status: 2 }).code, 0);
  assert.equal(runCompiler({ output: Array(55).fill(diagnostic).join('\n'), status: 2 }).code, 1);
  for (const type of ['TS2304', 'TS2552']) {
    assert.equal(runCompiler({ output: `api/a.js(1,1): error ${type}: Undefined name`, status: 2 }).code, 1);
  }
  assert.equal(runCompiler({ output: `${diagnostic}\nerror TS5083: Cannot read file.`, status: 2 }).code, 1);
});
