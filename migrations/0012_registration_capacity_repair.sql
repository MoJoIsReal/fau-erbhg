-- Repair events.current_attendees after the capacity-rollback defect.
--
-- api/registrations.js used to increment current_attendees in one CTE and try
-- to undo that in a second CTE updating the same events row. PostgreSQL does
-- not apply a second update to a row already updated by the same statement
-- (manual 7.8.2, "Data-Modifying Statements in WITH"), so the compensating
-- update was silently skipped and never ran. Every signup that reserved
-- capacity but did not insert a registration — a duplicate email, or an
-- ON CONFLICT DO NOTHING from a concurrent insert — therefore consumed a seat
-- permanently. On a capacity-limited event that eventually refuses genuine
-- parents with "Event is at capacity" while seats stand empty.
--
-- The handler is fixed to update the row at most once. This reconciles the
-- rows that already drifted. It is idempotent: re-running it is a no-op once
-- the counter agrees with the registrations.
--
-- NOTE: this also absorbs drift from the GDPR retention cleanup in
-- api/cron/event-reminders.js, which deletes event_registrations rows without
-- adjusting the counter. That is a separate open issue (DB-002); until it is
-- fixed, events older than the 6-month retention window will drift again.

UPDATE events e
SET current_attendees = COALESCE(agg.total, 0)
FROM (
  SELECT ev.id AS event_id,
         (SELECT COALESCE(SUM(r.attendee_count), 0)
          FROM event_registrations r
          WHERE r.event_id = ev.id) AS total
  FROM events ev
) agg
WHERE e.id = agg.event_id
  AND e.current_attendees IS DISTINCT FROM agg.total;
