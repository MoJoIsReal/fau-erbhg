-- Optional clock time on a dated yearly-calendar entry ("HH:MM", Norwegian
-- local time). Without a start time an entry stays all-day, which is what
-- every existing row is; with one it becomes a timed entry and the calendar
-- feed publishes it with a real start and end instead of a whole-day block.
ALTER TABLE yearly_calendar_entries
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text;
