-- Newsletter ("nyhetsbrev") subscriptions with double opt-in, plus per-entry
-- flags that arm the daily cron to email subscribers the day before an event.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  language text NOT NULL DEFAULT 'no',
  status text NOT NULL DEFAULT 'pending',
  confirm_token text,
  unsubscribe_token text NOT NULL,
  created_at text NOT NULL,
  confirmed_at text,
  unsubscribed_at text
);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_idx
  ON newsletter_subscribers (status);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS notify_newsletter boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_sent_at text;

ALTER TABLE yearly_calendar_entries
  ADD COLUMN IF NOT EXISTS notify_newsletter boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_sent_at text;
