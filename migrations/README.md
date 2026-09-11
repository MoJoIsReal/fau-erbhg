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
