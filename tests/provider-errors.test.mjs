import assert from 'node:assert/strict';
import test from 'node:test';
import { reportProviderError, safeProviderError } from '../api/_shared/provider-errors.js';

test('provider errors redact email and phone while retaining safe diagnostics', () => {
  const safe = safeProviderError(Object.assign(
    new Error('Rejected parent@example.test at +47 999 88 777'),
    { code: 'EENVELOPE' },
  ));
  assert.equal(safe.message.includes('parent@example.test'), false);
  assert.equal(safe.message.includes('999 88 777'), false);
  assert.match(safe.message, /\[redacted-email\]/);
  assert.match(safe.message, /\[redacted-phone\]/);
  assert.equal(safe.code, 'EENVELOPE');
});

test('provider reporting logs only the redacted representation', (t) => {
  const calls = [];
  t.mock.method(console, 'error', (...args) => calls.push(args));
  reportProviderError('Mail failed', new Error('Recipient child@example.test'));
  const serialized = JSON.stringify(calls);
  assert.equal(serialized.includes('child@example.test'), false);
  assert.match(serialized, /redacted-email/);
});
