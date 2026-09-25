# Database Migrations

Apply SQL files in lexical order before deploying code that depends on them.

For Neon, the simplest path is to open the Neon SQL editor and run the full
contents of each migration file. The current migrations are:

1. `0001_production_hardening.sql`
2. `0002_event_registration_deadline.sql`
3. `0003_newsletter.sql`
4. `0004_blog_post_category.sql`
5. `0005_user_token_version.sql`
6. `0006_user_password_policy.sql`
7. `0007_contact_message_replies.sql`
8. `0008_delivery_outbox.sql`
9. `0009_registration_integrity.sql`
10. `0010_blog_post_newsletter.sql`
11. `0011_yearly_calendar_times.sql`
12. `0012_registration_capacity_repair.sql`
13. `0013_yearly_calendar_category.sql`
14. `0014_calendar_family_category.sql`
15. `0015_registration_cancel_token.sql`
16. `0016_registration_cancellations.sql`
17. `0017_delivery_failed_status.sql`
18. `0018_iso_text_timestamps.sql`

Important: the unique registration index can fail if existing data already has
duplicate `(event_id, lower(email))` rows. If that happens, merge/remove the
duplicates first, then rerun the migration.

Numbering note: `0005_user_token_version.sql` was previously checked in as
`0004_user_token_version.sql`, a duplicate prefix with `0004_blog_post_category.sql`
(applied first, at 21:42 vs. 21:50 on 2026-06-24). Renumbered for a
unique, chronological sequence — the SQL itself is unchanged, so if you already
applied it under the old filename there's nothing to redo.

## Delivery outbox deployment order

`0008_delivery_outbox.sql` must be applied **before** deploying the matching cron
code. The new code reads `newsletter_deliveries`, `reminder_claimed_at`, and
`reminder_attempts` on every scheduled run. Merging first would make both cron
variants fail until the migration is present.

After applying the migration, verify the objects before deploying:

```sql
SELECT to_regclass('public.newsletter_deliveries');
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'event_registrations'
  AND column_name IN ('reminder_claimed_at', 'reminder_attempts')
ORDER BY column_name;
```

The first query must return `newsletter_deliveries`; the second must return both
columns. The migration is additive and safe to rerun because it uses
`IF NOT EXISTS` for schema objects.

## Newsletter flag on news posts

`0010_blog_post_newsletter.sql` adds `notify_newsletter` and
`newsletter_sent_at` to `blog_posts`, and widens the `newsletter_deliveries`
`item_type` check to accept `'news'` alongside `'event'` and `'calendar'`. Apply it **before** deploying the
matching code: the evening cron (`/api/cron/event-reminders?task=newsletter`)
reads both columns on every run, and the content editor writes
`notify_newsletter` on save. Existing posts default to `false`, so applying the
migration on its own broadcasts nothing.

Verify after applying:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'blog_posts'
  AND column_name IN ('notify_newsletter', 'newsletter_sent_at');
```

### Parents and children category

Apply `0014_calendar_family_category.sql` before deploying support for the
`family` category. It extends the yearly-entry constraint; existing categories
and entries remain unchanged.

## Self-service registration cancellation

`0015_registration_cancel_token.sql` adds `event_registrations.cancel_token`, a
secret per registration that the confirmation and reminder emails link to
(`/avmelding?token=…`). The column's database default generates the token, so
the migration is safe to apply before the code: old code simply ignores it.
Apply it **before** deploying the matching code, which selects the column in
the reminder cron and looks registrations up by it. Verify with:

```sql
SELECT COUNT(*) FROM event_registrations WHERE cancel_token IS NULL;  -- 0
```

`0016_registration_cancellations.sql` adds `event_registration_cancellations`,
where a self-service cancellation copies the registration before deleting it,
so council members can see who cancelled. Apply it together with 0015, before
deploying: the cancel statement and the nightly retention both write to it.

## Retired newsletter deliveries

`0017_delivery_failed_status.sql` adds `'failed'` to
`newsletter_deliveries_status_check`. The evening cron retires a delivery as
`'failed'` after five unsuccessful sends, and 0008's check did not allow that
state: the retiring `UPDATE` failed, so the row was retried every night, the
run ended in a 500, and the source item was never stamped as sent. Apply it as
soon as possible; the code already depends on it. Verify with:

```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'newsletter_deliveries_status_check';  -- lists 'failed'
```

Rows already stuck by the old constraint recover on their own: the next run
reclaims them after the lease and can now retire them.

## ISO text timestamps

Date columns here are `text` holding ISO 8601 (`2026-09-24T11:56:00.123Z`),
which the browser parses with `new Date()`. Six writers used `NOW()`, which
stores PostgreSQL's own text form (`2026-09-24 11:56:00.123456+00`):
`contact_messages.created_at`, `documents.uploaded_at`, the three
`newsletter_sent_at` stamps and `event_registrations.reminder_sent_at`. The code
now writes ISO; `0018_iso_text_timestamps.sql` rewrites the rows written before
it. It touches only values in exactly `NOW()`'s form, so it is safe to rerun and
to apply before or after the deploy. Verify with:

```sql
SELECT count(*) FROM contact_messages WHERE created_at !~ '^\d{4}-\d{2}-\d{2}T';  -- 0
SELECT count(*) FROM documents WHERE uploaded_at !~ '^\d{4}-\d{2}-\d{2}T';      -- 0
```
