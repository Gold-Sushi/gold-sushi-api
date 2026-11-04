-- Users: account lifecycle — run BEFORE deploying the matching code.
--
-- The app runs TypeORM with `synchronize: true`. For Postgres, TypeORM applies
-- a varchar length change by DROPPING and re-adding the column. On a populated
-- table that fails on the re-add (`column "lastName" ... contains null values`),
-- the transaction rolls back, and the app cannot boot. Widening the columns here
-- first means synchronize sees no difference and leaves them alone.
--
-- 1. Stop the app, so a retrying boot cannot synchronize mid-way. Then back up:
--    create a Neon branch, or  pg_dump "$DATABASE_URL" > users-backup.sql
--    (synchronize will also drop the unused columns smsVerified, smsToken,
--    registration_token, accessToken, refreshToken.)
--
-- 2. This must return 0 rows, or lowercasing emails would break the unique
--    constraint. Merge or rename the listed accounts by hand first.
SELECT lower(trim(email)) AS email, count(*)
FROM users
GROUP BY 1
HAVING count(*) > 1;

-- 3. Schema + data fixes.
BEGIN;

ALTER TABLE users
  ALTER COLUMN email TYPE varchar(255),
  ALTER COLUMN "firstName" TYPE varchar(100),
  ALTER COLUMN "lastName" TYPE varchar(100);

UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));

-- A @BeforeInsert hook used to force registered = false on every insert, so
-- real accounts were indistinguishable from guests. Accounts with a password
-- are the registered ones.
UPDATE users SET registered = true WHERE password IS NOT NULL AND registered = false;

COMMIT;

-- 4. Deploy. synchronize then adds the new columns (status, *_at,
--    token_version, blocked_reason, updated_at), relaxes NOT NULL on phone
--    and drops the unused columns.
