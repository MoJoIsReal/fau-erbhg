# Database Migrations

Apply SQL files in lexical order before deploying code that depends on them.

For Neon, the simplest path is to open the Neon SQL editor and run the full
contents of each migration file. The current production-hardening migration is:

1. `0001_production_hardening.sql`

Important: the unique registration index can fail if existing data already has
duplicate `(event_id, lower(email))` rows. If that happens, merge/remove the
duplicates first, then rerun the migration.

