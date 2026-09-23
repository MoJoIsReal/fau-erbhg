-- Keep a record of self-service cancellations so council members can see who
-- cancelled. The cancel link (0015) deletes the registration — that is what
-- releases the seat and the photo slot, and keeps every attendee count, which
-- sums event_registrations, correct without change. The same statement copies
-- the row here first.
--
-- A council member's own delete in the registrations list is not a
-- cancellation and is not recorded. Rows follow the registrations' retention:
-- the nightly cron deletes them 6 months after the event, and deleting the
-- event removes them with it. Apply before deploying the matching code.
-- Safe to rerun.

CREATE TABLE IF NOT EXISTS event_registration_cancellations (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id integer NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  attendee_count integer,
  children_names text,
  registered_at text,
  cancelled_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_registration_cancellations_event_id_idx
  ON event_registration_cancellations (event_id);
