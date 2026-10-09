-- event_registrations.registered_at should be text holding an ISO 8601 string,
-- like every date column here (shared/schema.ts). Two histories reach this
-- migration:
--
-- * A database built by the migrations: 0001 added the column as text with
--   DEFAULT NOW()::text, which stores PostgreSQL's own form
--   ('2026-09-24 11:56:00.123456+00'); 0018 rewrote the other columns written
--   like that but missed this one.
-- * Production: the column predates 0001 (whose ADD COLUMN IF NOT EXISTS was
--   then a no-op) and is `timestamp without time zone`. Its values are UTC wall
--   times: the default was now() in a UTC session, and the ISO strings the code
--   writes lose their 'Z' on the way in. The first version of this file
--   assumed text and failed there with SQLSTATE 42804 before changing anything.
--
-- This converts a timestamp column to text in that ISO form, sets an ISO
-- default, and rewrites any text value still in PostgreSQL's form, here and in
-- the cancellation history that copies it (0016's text column, which holds
-- either form, with or without an offset). A value without an offset is read
-- as UTC. Only values in exactly those forms are touched, so it is safe to
-- rerun. Safe to apply before or after deploying the code.

DO $$
DECLARE
  column_type text;
BEGIN
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'event_registrations'
    AND column_name = 'registered_at';

  IF column_type IN ('timestamp without time zone', 'timestamp with time zone') THEN
    ALTER TABLE event_registrations ALTER COLUMN registered_at DROP DEFAULT;
    IF column_type = 'timestamp with time zone' THEN
      ALTER TABLE event_registrations ALTER COLUMN registered_at TYPE text
        USING to_char(registered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    ELSE
      ALTER TABLE event_registrations ALTER COLUMN registered_at TYPE text
        USING to_char(registered_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    END IF;
  END IF;
END $$;

ALTER TABLE event_registrations
  ALTER COLUMN registered_at SET DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

-- PostgreSQL's text form, with an offset (written by NOW()::text) or without
-- one (copied from a timestamp column, so UTC).
UPDATE event_registrations
SET registered_at = to_char(
  CASE WHEN registered_at ~ '[+-]\d{2}(:\d{2})?$'
    THEN registered_at::timestamptz
    ELSE registered_at::timestamp AT TIME ZONE 'UTC'
  END AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE registered_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?)?$';

UPDATE event_registration_cancellations
SET registered_at = to_char(
  CASE WHEN registered_at ~ '[+-]\d{2}(:\d{2})?$'
    THEN registered_at::timestamptz
    ELSE registered_at::timestamp AT TIME ZONE 'UTC'
  END AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE registered_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?)?$';

-- Verify (expect text, 0 and 0):
-- SELECT data_type FROM information_schema.columns WHERE table_name = 'event_registrations' AND column_name = 'registered_at';
-- SELECT count(*) FROM event_registrations WHERE registered_at !~ '^\d{4}-\d{2}-\d{2}T';
-- SELECT count(*) FROM event_registration_cancellations WHERE registered_at !~ '^\d{4}-\d{2}-\d{2}T';
