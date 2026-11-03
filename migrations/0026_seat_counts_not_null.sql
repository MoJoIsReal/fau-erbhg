-- The seat columns had no rules of their own. attendee_count was nullable,
-- and the code read a NULL two ways: the counters and the nightly repair
-- summed it as 0, while every write path and the council's list took it as 1.
-- A legacy row with NULL was a seat the repair did not count, and a cancel
-- or delete then freed a seat that had never been taken. Nothing stopped a
-- negative count either.
--
-- Today's writers always store a whole number, so a NULL can only come from
-- an old or hand-written row. This migration:
--   1. stops without changing anything if a count is below its floor (look
--      with the queries at the end of this comment and fix the rows first);
--   2. reads a NULL attendee count as one person, as the app always did, and
--      a NULL current_attendees as the sum of the event's registrations;
--   3. makes the counts NOT NULL and adds CHECKs.
-- max_attendees stays nullable: NULL means no limit.
--
--   SELECT id, attendee_count FROM event_registrations WHERE attendee_count < 1;
--   SELECT id, attendee_count FROM event_registration_cancellations WHERE attendee_count < 1;
--   SELECT id, current_attendees, max_attendees FROM events WHERE current_attendees < 0 OR max_attendees < 0;
--
-- Safe to rerun.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM event_registrations WHERE attendee_count < 1)
     OR EXISTS (SELECT 1 FROM event_registration_cancellations WHERE attendee_count < 1)
     OR EXISTS (SELECT 1 FROM events WHERE current_attendees < 0 OR max_attendees < 0) THEN
    RAISE EXCEPTION 'a seat count is below zero (or an attendee count below one); fix those rows first (see the queries at the top of 0026_seat_counts_not_null.sql)';
  END IF;
END $$;

UPDATE event_registrations SET attendee_count = 1 WHERE attendee_count IS NULL;
UPDATE event_registration_cancellations SET attendee_count = 1 WHERE attendee_count IS NULL;
UPDATE events e
SET current_attendees = (
  SELECT COALESCE(SUM(r.attendee_count), 0)::int FROM event_registrations r WHERE r.event_id = e.id
)
WHERE e.current_attendees IS NULL;

ALTER TABLE event_registrations ALTER COLUMN attendee_count SET NOT NULL;
ALTER TABLE event_registration_cancellations ALTER COLUMN attendee_count SET DEFAULT 1;
ALTER TABLE event_registration_cancellations ALTER COLUMN attendee_count SET NOT NULL;
ALTER TABLE events ALTER COLUMN current_attendees SET NOT NULL;

ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_attendee_count_check;
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_attendee_count_check CHECK (attendee_count >= 1);
ALTER TABLE event_registration_cancellations DROP CONSTRAINT IF EXISTS event_registration_cancellations_attendee_count_check;
ALTER TABLE event_registration_cancellations ADD CONSTRAINT event_registration_cancellations_attendee_count_check CHECK (attendee_count >= 1);
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_current_attendees_check;
ALTER TABLE events ADD CONSTRAINT events_current_attendees_check CHECK (current_attendees >= 0);
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_max_attendees_check;
ALTER TABLE events ADD CONSTRAINT events_max_attendees_check CHECK (max_attendees >= 0);
