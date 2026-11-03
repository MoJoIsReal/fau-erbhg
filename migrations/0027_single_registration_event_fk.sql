-- event_registrations.event_id could carry two foreign keys to events: the
-- one migration 0009 adds by name (event_registrations_event_id_fkey, ON
-- DELETE RESTRICT) and one with Drizzle's generated name
-- (event_registrations_event_id_events_id_fk) in a database whose base
-- tables came from the schema declaration. Both refuse deleting an event
-- with registrations, but the second one fires first, and the events handler
-- recognised only the first by name: a delete that raced a signup answered
-- 500 instead of "has registrations". The handler now recognises either;
-- this keeps the one 0009 names and drops any other on that column.
--
-- Stops without changing anything if 0009's key is missing. Safe to rerun.

DO $$
DECLARE
  extra record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'event_registrations'::regclass AND conname = 'event_registrations_event_id_fkey'
  ) THEN
    RAISE EXCEPTION 'event_registrations_event_id_fkey is missing; apply 0009_registration_integrity.sql first';
  END IF;

  FOR extra IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'event_registrations'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'events'::regclass
      AND c.conname <> 'event_registrations_event_id_fkey'
      AND c.conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'event_registrations'::regclass AND attname = 'event_id'
      )]
  LOOP
    EXECUTE format('ALTER TABLE event_registrations DROP CONSTRAINT %I', extra.conname);
  END LOOP;
END $$;
