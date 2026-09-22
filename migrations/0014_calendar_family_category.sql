-- Allow the shared parents-and-children category without changing existing rows.
BEGIN;

ALTER TABLE yearly_calendar_entries
  DROP CONSTRAINT IF EXISTS yearly_calendar_entries_category_check;

ALTER TABLE yearly_calendar_entries
  ADD CONSTRAINT yearly_calendar_entries_category_check
  CHECK (category IS NULL OR category IN (
    'arrangement', 'family', 'mote', 'dugnad', 'foto', 'internt',
    'bhgdag', 'varmmat', 'temauke', 'stengt', 'beskjed', 'info'
  ));

COMMIT;
