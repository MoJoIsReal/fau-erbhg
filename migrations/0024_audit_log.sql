-- Who changed what in the admin area. Every successful change made by a
-- signed-in council member, admin or staff user writes one row from
-- withApiHandler (api/_shared/middleware.js): the account and its role, the
-- route, the multiplexed action/resource, the id it acted on (or created) and
-- Vercel's request id. Runtime logs on the Hobby plan are kept for an hour,
-- which made "who deleted that post last week?" unanswerable.
--
-- No content is copied: no titles, names, e-mail addresses or bodies, only
-- ids. user_id is a plain integer rather than a foreign key, so a row still
-- says who acted after that account is deleted.
--
-- The morning cron deletes rows older than 12 months (AUDIT_LOG_RETENTION_DAYS
-- in api/cron/event-reminders.js). created_at is ISO 8601 text like every
-- other date column. Apply before deploying the matching code; until then the
-- write fails quietly and is logged. Safe to rerun.

CREATE TABLE IF NOT EXISTS audit_log (
  id serial PRIMARY KEY,
  created_at text NOT NULL,
  user_id integer NOT NULL,
  role text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  action text,
  resource text,
  target_id integer,
  status integer NOT NULL,
  request_id text
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at);

-- Verify:
-- SELECT created_at, user_id, role, method, path, action, resource, target_id FROM audit_log ORDER BY id DESC LIMIT 20;
