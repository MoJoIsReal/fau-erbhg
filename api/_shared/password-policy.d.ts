export const PASSWORD_EXPIRY_DAYS: 365;

export function generateTemporaryPassword(length?: number): string;

export function isPasswordChangeRequired(
  user: { mustChangePassword?: boolean | null; passwordChangedAt?: string | null },
  now?: Date,
): boolean;
