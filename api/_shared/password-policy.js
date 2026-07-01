import crypto from 'crypto';

export const PASSWORD_EXPIRY_DAYS = 365;
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

export async function ensureUserPasswordPolicyColumns(sql) {
  await sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS password_changed_at text
  `;
  await sql`
    UPDATE users
    SET password_changed_at = created_at
    WHERE password_changed_at IS NULL
  `;
}
