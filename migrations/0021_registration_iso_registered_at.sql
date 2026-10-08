-- event_registrations.registered_at is text holding an ISO 8601 string, like
-- every date column here. Migration 0001 added it with DEFAULT NOW()::text,
-- which stores PostgreSQL's own form ('2026-09-24 11:56:00.123456+00'), and
-- backfilled the rows that existed then the same way; 0018 rewrote the other
-- columns written like that but missed this one. Signups now always write the
-- value themselves, so the default only covers a row inserted without one.
--
-- This sets an ISO default and rewrites the rows still in NOW()'s form, here
-- and in the cancellation history that copies them. Only values in exactly
-- that form are touched, so it is safe to rerun and leaves anything else as it
-- is. Safe to apply before or after deploying the code.

ALTER TABLE event_registrations
  ALTER COLUMN registered_at SET DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

UPDATE event_registrations
SET registered_at = to_char(registered_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE registered_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$';

UPDATE event_registration_cancellations
SET registered_at = to_char(registered_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE registered_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$';

-- Verify (expect 0 and 0):
-- SELECT count(*) FROM event_registrations WHERE registered_at !~ '^\d{4}-\d{2}-\d{2}T';
-- SELECT count(*) FROM event_registration_cancellations WHERE registered_at !~ '^\d{4}-\d{2}-\d{2}T';
