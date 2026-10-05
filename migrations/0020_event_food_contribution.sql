-- Potluck signups ("kurvfest"): an event can ask everyone who signs up what
-- food they will bring, and each registration stores the answer.
--
-- `events.potluck` is chosen per event, so a foreldrefest can be a kurvfest one
-- year and catered the next. Existing events default to false and ask nothing.
-- `event_registrations.food_contribution` is NULL for every registration to an
-- event that does not ask.
--
-- Additive and safe to rerun. Apply it BEFORE deploying the matching code: the
-- events API writes `potluck` on every create/update and the signup reads it.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS potluck boolean NOT NULL DEFAULT false;

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS food_contribution text;
