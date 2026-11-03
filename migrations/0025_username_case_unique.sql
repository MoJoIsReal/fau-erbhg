-- A username is an e-mail address, and every sign-in, reset and lookup reads
-- it case-insensitively (lower(username)). The only uniqueness rule was the
-- plain UNIQUE(username), which let "Ola@x.no" and "ola@x.no" both exist;
-- sign-in then took whichever row came back first, and a reset link could
-- go to the other account. New usernames are stored lower-case by the app,
-- so a pair can only come from a row written by hand.
--
-- Stops without changing anything if such a pair already exists. Find them
-- with:
--   SELECT lower(username), array_agg(username ORDER BY id)
--   FROM users GROUP BY 1 HAVING count(*) > 1;
-- merge or remove the extra account, then run this again. Safe to rerun.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users GROUP BY lower(username) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'users differing only in letter case exist; merge them first (see the query at the top of 0025_username_case_unique.sql)';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique_idx ON users (lower(username));
