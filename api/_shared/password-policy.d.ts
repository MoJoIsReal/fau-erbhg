export const PASSWORD_EXPIRY_DAYS: 365;

export function generateTemporaryPassword(length?: number): string;

export function isPasswordChangeRequired(
  user: { mustChangePassword?: boolean | null; passwordChangedAt?: string | null },
  now?: Date,
): boolean;

export function isUndefinedColumnError(error: unknown): boolean;

export const TEMPORARY_PASSWORD_DAYS: 7;

export function temporaryPasswordExpiry(now?: Date): string;

export function isTemporaryPasswordExpired(
  user: { tempPasswordExpiresAt?: string | null },
  now?: Date,
): boolean;
