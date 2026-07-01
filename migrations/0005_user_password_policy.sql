ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at text;

UPDATE users
SET password_changed_at = created_at
WHERE password_changed_at IS NULL;
