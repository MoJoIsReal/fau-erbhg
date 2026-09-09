-- Durable newsletter fan-out and retryable registration-reminder claims.
-- Apply before deploying the cron code that references these columns/table.

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS reminder_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_attempts integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id serial PRIMARY KEY,
  item_type text NOT NULL CHECK (item_type IN ('event', 'calendar')),
  item_id integer NOT NULL,
  subscriber_id integer NOT NULL REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  event_date text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT NOW(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_deliveries_item_subscriber_unique_idx
  ON newsletter_deliveries (item_type, item_id, subscriber_id);

CREATE INDEX IF NOT EXISTS newsletter_deliveries_claim_idx
  ON newsletter_deliveries (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS newsletter_deliveries_event_date_idx
  ON newsletter_deliveries (event_date);
