-- The evening cron retires a newsletter delivery as 'failed' once it has used
-- up MAX_DELIVERY_ATTEMPTS (api/cron/event-reminders.js), and the retention
-- cleanup collects 'failed' rows after 90 days. 0008 created the status check
-- before that state existed, so the retiring UPDATE violated it: the row stayed
-- 'processing', was reclaimed and retried every night, every evening run ended
-- in a 500, and the source item was never stamped as sent.
--
-- Widen the check to the state set the code writes. Safe to rerun, and safe to
-- apply before or after deploying: the code already writes 'failed'.

ALTER TABLE newsletter_deliveries
  DROP CONSTRAINT IF EXISTS newsletter_deliveries_status_check;

ALTER TABLE newsletter_deliveries
  ADD CONSTRAINT newsletter_deliveries_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed'));
