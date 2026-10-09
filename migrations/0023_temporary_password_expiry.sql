-- A temporary password is mailed in clear text when an admin creates an
-- account. It used to work until the user changed it, however long that took:
-- an unread welcome mail, or a mailbox read by someone else months later, was
-- a way into the account, and whoever used it first chose the real password.
--
-- It now works for 7 days (TEMPORARY_PASSWORD_DAYS in
-- api/_shared/password-policy.js); after that, login refuses it with
-- TEMP_PASSWORD_EXPIRED and the admin sends a new one from the user list.
-- Cleared when the user sets their own password.
--
-- Accounts still waiting for their first login when this is applied get 7
-- days from now, so nobody is locked out by the deploy. Safe to rerun.

ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires_at text;

UPDATE users
SET temp_password_expires_at = to_char((now() + interval '7 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE must_change_password = true AND password_changed_at IS NULL AND temp_password_expires_at IS NULL;

-- Verify:
-- SELECT username, temp_password_expires_at FROM users WHERE temp_password_expires_at IS NOT NULL;
