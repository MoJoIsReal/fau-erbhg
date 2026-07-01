import crypto from 'crypto';

export const PASSWORD_EXPIRY_DAYS = 365;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 16) {
  let password = '';
  while (password.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < PASSWORD_ALPHABET.length * 4) {
      password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
  }
  return password;
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
