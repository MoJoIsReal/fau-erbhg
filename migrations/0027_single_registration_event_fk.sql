-- event_registrations.event_id could carry two foreign keys to events: the
-- one migration 0009 adds (event_registrations_event_id_fkey, ON DELETE
-- RESTRICT), and, in a database whose base tables came from the schema
-- declaration, a second one under Drizzle's name. Both refuse deleting an
-- event with registrations, but the second fired first, and the events handler
-- recognised only the first by name: a delete that raced a signup answered
-- 500. The handler now recognises either; this drops the second.
--
-- 0009's key stays, so the rule itself is unchanged. If the database never
-- had the second key, this does nothing. Safe to rerun.

ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_event_id_events_id_fk;
