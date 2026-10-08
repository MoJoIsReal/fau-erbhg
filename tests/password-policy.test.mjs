import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_EXPIRY_DAYS,
  TEMPORARY_PASSWORD_DAYS,
  generateTemporaryPassword,
  isPasswordChangeRequired,
  isTemporaryPasswordExpired,
  isUndefinedColumnError,
  temporaryPasswordExpiry,
} from '../api/_shared/password-policy.js';

test('temporary passwords mix all three character classes and skip look-alikes', () => {
  for (let i = 0; i < 50; i += 1) {
    const password = generateTemporaryPassword();
    assert.equal(password.length, 16);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /[0-9]/);
    assert.doesNotMatch(password, /[IOl01]/, 'ambiguous characters are left out of the alphabet');
  }
  assert.equal(generateTemporaryPassword(1).length, 3, 'never shorter than one of each class');
});

test('a password must be changed when flagged, missing a timestamp, or a year old', () => {
  const now = new Date('2026-07-01T12:00:00Z');
  assert.equal(PASSWORD_EXPIRY_DAYS, 365);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: true, passwordChangedAt: now.toISOString() }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: null }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: '2025-06-30T11:59:59Z' }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: '2025-07-02T12:00:00Z' }, now), false);
});

test('only a missing-column error is treated as a pre-migration database', () => {
  assert.equal(isUndefinedColumnError({ code: '42703' }), true);
  assert.equal(isUndefinedColumnError({ message: 'column "must_change_password" does not exist' }), true);
  assert.equal(isUndefinedColumnError({ code: '23505' }), false);
});

// A temporary password travels in clear text by e-mail: it works for a week.
test('a temporary password expires seven days after it was issued', () => {
  const issued = new Date('2026-10-01T12:00:00.000Z');
  const expiresAt = temporaryPasswordExpiry(issued);
  assert.equal(TEMPORARY_PASSWORD_DAYS, 7);
  assert.equal(expiresAt, '2026-10-08T12:00:00.000Z');
  assert.equal(isTemporaryPasswordExpired({ tempPasswordExpiresAt: expiresAt }, new Date('2026-10-08T11:59:59.000Z')), false);
  assert.equal(isTemporaryPasswordExpired({ tempPasswordExpiresAt: expiresAt }, new Date('2026-10-08T12:00:00.000Z')), true);
  assert.equal(isTemporaryPasswordExpired({ tempPasswordExpiresAt: null }), false, 'an own password never expires this way');
  assert.equal(isTemporaryPasswordExpired({}), false);
});
