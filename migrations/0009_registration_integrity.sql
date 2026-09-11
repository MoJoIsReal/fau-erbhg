-- Registration integrity: reject orphan rows, enforce the event FK, and add a
-- normalized unique reservation table for concurrent photo-slot allocation.
-- Apply before deploying the matching registrations/events API code.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM event_registrations r
    LEFT JOIN events e ON e.id = r.event_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot add event_registrations_event_id_fkey: orphan registrations exist';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_registrations_event_id_fkey'
      AND conrelid = 'event_registrations'::regclass
  ) THEN
    ALTER TABLE event_registrations
      ADD CONSTRAINT event_registrations_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS photo_event_slots (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id integer NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  slot text NOT NULL CHECK (slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS photo_event_slots_event_slot_unique_idx
  ON photo_event_slots (event_id, slot);

CREATE INDEX IF NOT EXISTS photo_event_slots_registration_idx
  ON photo_event_slots (registration_id);
