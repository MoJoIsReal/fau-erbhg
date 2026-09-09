-- Reply-from-the-admin-panel support for contact form inquiries.
--
-- `status`, `responded_at` and `responded_by` already exist in production (they
-- were added straight in the Neon SQL editor and were never declared in
-- shared/schema.ts). They are re-created here with IF NOT EXISTS so the schema
-- file and the database finally agree — running this against production is a
-- no-op for those three columns.

ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS responded_at text;
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS responded_by text;

-- New: the body of the reply FAU sent, so the council can see what was
-- answered without opening the shared Gmail account.
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS response_message text;

-- Dates in this project are stored as ISO text (see AGENTS.md). If an older
-- deployment created responded_at as a timestamp, normalize it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_messages'
      AND column_name = 'responded_at'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE contact_messages
      ALTER COLUMN responded_at TYPE text USING responded_at::text;
  END IF;
END $$;
