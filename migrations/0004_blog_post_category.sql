ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'news';

UPDATE blog_posts
SET category = 'news'
WHERE category IS NULL OR category = '';

CREATE INDEX IF NOT EXISTS blog_posts_category_status_idx
  ON blog_posts (category, status);
