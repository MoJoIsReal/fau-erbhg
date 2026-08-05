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

Important: the unique registration index can fail if existing data already has
duplicate `(event_id, lower(email))` rows. If that happens, merge/remove the
duplicates first, then rerun the migration.

Numbering note: `0005_user_token_version.sql` was previously checked in as
`0004_user_token_version.sql`, a duplicate prefix with `0004_blog_post_category.sql`
(applied first, at 21:42 vs. 21:50 on 2026-06-24). Renumbered for a
unique, chronological sequence — the SQL itself is unchanged, so if you already
applied it under the old filename there's nothing to redo.
