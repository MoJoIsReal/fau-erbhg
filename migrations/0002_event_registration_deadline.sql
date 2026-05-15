-- Add optional signup deadline for events.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS registration_deadline text;
