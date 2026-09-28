-- Private media shares (docs/mediedeling.md): photos, video and audio the
-- council uploads to a private Cloudflare R2 bucket and shares by secret link.
-- The files live in R2; these tables hold what the API needs to find, show,
-- extend and delete them.
--
-- media_shares.token_hash is the SHA-256 of the link token and is what a
-- viewer's request is looked up by. token_sealed is the same token sealed
-- with AES-GCM under a key derived from SESSION_SECRET, so the admin page can
-- copy the link again; neither column opens a share on its own.
--
-- Dates are ISO 8601 text like the rest of the schema. A share is a 'draft'
-- while it is being uploaded to and 'published' once its link works;
-- expires_at is set when it is published. Expired shares and drafts older
-- than a day are deleted, files first, by the morning cron.
--
-- No file names are stored anywhere: object keys are random.
-- Apply before deploying the matching code. Safe to rerun.

CREATE TABLE IF NOT EXISTS media_shares (
  id serial PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  token_sealed text NOT NULL,
  title text NOT NULL,
  description text,
  pin_hash text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  lifetime_days integer NOT NULL CHECK (lifetime_days BETWEEN 1 AND 365),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL,
  published_at text,
  expires_at text
);

CREATE INDEX IF NOT EXISTS media_shares_status_expires_idx
  ON media_shares (status, expires_at);

CREATE TABLE IF NOT EXISTS media_files (
  id serial PRIMARY KEY,
  share_id integer NOT NULL REFERENCES media_shares(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('image', 'video', 'audio')),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  width integer,
  height integer,
  position integer NOT NULL DEFAULT 0,
  upload_id text,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready')),
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS media_files_share_id_idx
  ON media_files (share_id, position);
