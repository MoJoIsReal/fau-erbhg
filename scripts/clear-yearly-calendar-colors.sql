-- Clear all per-entry colour overrides from the yearly calendar so every
-- entry falls back to the type-based default (Mat=gul, Uke info=blå,
-- Stengt=rød, Dags events=grønn, Notat=rød).
--
-- Use this after the badge-colour standardisation when test data still has
-- legacy `color` values that no longer match the new scheme. Safe to re-run.
--
-- Run against the Neon database, e.g.:
--   psql "$DATABASE_URL" -f scripts/clear-yearly-calendar-colors.sql
-- or paste the statement into the Neon SQL editor.
--
-- ⚠ This wipes EVERY explicit colour override. Run on a test/dev database
-- first. If you want to preserve custom hex overrides (e.g. "#abc123") and
-- only drop the named-preset overrides ("red", "yellow", …), use the
-- alternative statement below instead.

BEGIN;

-- Default: clear all colour overrides.
UPDATE yearly_calendar_entries
SET color = NULL,
    updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE color IS NOT NULL;

-- Alternative: only clear named-preset colours, keep custom hex overrides.
-- UPDATE yearly_calendar_entries
-- SET color = NULL,
--     updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
-- WHERE color IN ('red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple');

SELECT count(*) AS rows_with_color_remaining
FROM yearly_calendar_entries
WHERE color IS NOT NULL;

COMMIT;
