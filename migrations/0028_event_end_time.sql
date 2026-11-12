-- Optional end time on an event ("HH:MM", Norwegian local time, after the
-- start time). Until now an event had only a start, and nothing invents a
-- duration: the calendar feed and the search-engine markup leave the end out.
-- With an end entered, the site shows "18:00–20:00", the feed publishes a
-- DTEND and the event's JSON-LD carries an endDate. Existing events keep NULL.
--
-- Additive and safe to rerun.
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time text;
