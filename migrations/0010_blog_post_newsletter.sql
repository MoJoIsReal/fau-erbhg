-- Lets an author flag a news post for the newsletter. The evening cron picks
-- up every published post with notify_newsletter = true that has not been
-- broadcast yet, then stamps newsletter_sent_at so it never goes out twice.
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS notify_newsletter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_sent_at text;

-- The cron's queue query filters on exactly this predicate; the partial index
-- keeps it cheap as the post archive grows.
CREATE INDEX IF NOT EXISTS blog_posts_newsletter_pending_idx
  ON blog_posts (published_date)
  WHERE notify_newsletter = true AND newsletter_sent_at IS NULL;

-- newsletter_deliveries was created with item_type limited to events and
-- calendar entries (0008); news posts are a third source riding the same
-- outbox, so widen the constraint before the cron starts inserting them.
ALTER TABLE newsletter_deliveries
  DROP CONSTRAINT IF EXISTS newsletter_deliveries_item_type_check;

ALTER TABLE newsletter_deliveries
  ADD CONSTRAINT newsletter_deliveries_item_type_check
  CHECK (item_type IN ('event', 'calendar', 'news'));
