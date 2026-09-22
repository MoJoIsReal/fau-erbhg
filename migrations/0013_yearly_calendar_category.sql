-- Yearly calendar entries get a category of their own.
--
-- `entry_type` was doing two jobs at once: it says what *shape* a row has
-- (a single day, a whole week, a note across a span) and it was also the only
-- thing deciding the category chip the calendar shows. So every dated row
-- came out as "I barnehagen", whatever it actually was — a deadline for
-- registering summer holidays, an SU meeting that is internal, a FORUT
-- festival the parents are invited to.
--
-- `category` is nullable on purpose. NULL means "derive it from entry_type",
-- which is exactly what every existing row did, so nothing changes until
-- someone picks a category. The allowed values are the calendar's own kinds
-- (shared/calendar-entries.js), not the entry types.

ALTER TABLE yearly_calendar_entries
  ADD COLUMN IF NOT EXISTS category text;

-- The categories a row may carry. Kept as a CHECK rather than an enum so a
-- new kind is one migration, not a type rewrite. NULL stays allowed.
ALTER TABLE yearly_calendar_entries
  DROP CONSTRAINT IF EXISTS yearly_calendar_entries_category_check;

ALTER TABLE yearly_calendar_entries
  ADD CONSTRAINT yearly_calendar_entries_category_check
  CHECK (category IS NULL OR category IN (
    'arrangement', 'mote', 'dugnad', 'foto', 'internt',
    'bhgdag', 'varmmat', 'temauke', 'stengt', 'beskjed', 'info'
  ));
