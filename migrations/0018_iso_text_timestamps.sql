-- Date columns in this schema are text holding ISO 8601 strings
-- ('2026-09-24T11:56:00.123Z'), written by the code and parsed by the browser
-- with new Date(). Six writers used NOW() instead, which stores PostgreSQL's
-- own text form ('2026-09-24 11:56:00.123456+00'):
--   contact_messages.created_at, documents.uploaded_at,
--   events / blog_posts / yearly_calendar_entries.newsletter_sent_at,
--   event_registrations.reminder_sent_at.
-- The code now writes ISO for all of them; this rewrites the rows written
-- before that.
--
-- Only values in exactly NOW()'s text form are touched, so the migration is
-- safe to rerun, and anything unexpected is left as it is rather than failing
-- the cast. Safe to apply before or after deploying the code.

UPDATE contact_messages
SET created_at = to_char(created_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE created_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$';

UPDATE documents
SET uploaded_at = to_char(uploaded_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE uploaded_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$';

UPDATE events
SET newsletter_sent_at = to_char(newsletter_sent_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE newsletter_sent_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$';

UPDATE blog_posts
SET newsletter_sent_at = to_char(newsletter_sent_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE newsletter_sent_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$';

UPDATE yearly_calendar_entries
SET newsletter_sent_at = to_char(newsletter_sent_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE newsletter_sent_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$';

UPDATE event_registrations
SET reminder_sent_at = to_char(reminder_sent_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE reminder_sent_at ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$';
