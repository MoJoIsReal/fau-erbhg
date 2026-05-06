-- Production hardening schema changes.
-- Apply before/with deploying the Vercel-only backend.

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS children_names text,
  ADD COLUMN IF NOT EXISTS photo_slots text,
  ADD COLUMN IF NOT EXISTS reminder_sent_at text,
  ADD COLUMN IF NOT EXISTS registered_at text DEFAULT NOW()::text;

UPDATE event_registrations
SET registered_at = NOW()::text
WHERE registered_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_event_email_unique_idx
  ON event_registrations (event_id, lower(email));

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

