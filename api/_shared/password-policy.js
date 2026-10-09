import crypto from 'crypto';

export const PASSWORD_EXPIRY_DAYS = 365;
// A temporary password travels in clear text by e-mail, so it works for a
// week. After that the admin sends a new one (PATCH users in secure-settings).
export const TEMPORARY_PASSWORD_DAYS = 7;

export function temporaryPasswordExpiry(now = new Date()) {
  return new Date(now.getTime() + TEMPORARY_PASSWORD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** True when the account still runs on a temporary password whose week is over. */
export function isTemporaryPasswordExpired(user, now = new Date()) {
  if (!user?.tempPasswordExpiresAt) return false;
  const expiresAt = Date.parse(user.tempPasswordExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}
const PASSWORD_UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const PASSWORD_DIGITS = '23456789';
const PASSWORD_ALPHABET = `${PASSWORD_UPPERCASE}${PASSWORD_LOWERCASE}${PASSWORD_DIGITS}`;

export function generateTemporaryPassword(length = 16) {
  const targetLength = Math.max(length, 3);
  const chars = [
    randomChar(PASSWORD_UPPERCASE),
    randomChar(PASSWORD_LOWERCASE),
    randomChar(PASSWORD_DIGITS),
  ];

  while (chars.length < targetLength) {
    chars.push(randomChar(PASSWORD_ALPHABET));
  }

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join('');
}

function randomChar(alphabet) {
  while (true) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < alphabet.length * Math.floor(256 / alphabet.length)) {
      return alphabet[byte % alphabet.length];
    }
  }
}

export function isPasswordChangeRequired(user, now = new Date()) {
  if (!user) return false;
  if (user.mustChangePassword === true) return true;
  if (!user.passwordChangedAt) return true;

  const changedAt = new Date(user.passwordChangedAt);
  if (Number.isNaN(changedAt.getTime())) return true;

  const expiresAt = new Date(changedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + PASSWORD_EXPIRY_DAYS);
  return expiresAt <= now;
}

export function isUndefinedColumnError(error) {
  return error?.code === '42703' || /column .* does not exist/i.test(String(error?.message || ''));
}
