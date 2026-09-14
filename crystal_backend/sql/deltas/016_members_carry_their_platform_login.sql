-- ---------------------------------------------------------------------
-- Delta 016 - a member carries the login the platform knows them by.
--
-- Sign-in moved to `ora_pid.users` (src/repositories/legacy/members.repository.js):
-- one person, one credential, shared with the Eshop, the Appstore and the
-- mobile app. Crystal's own `users` row survives as the local anchor every
-- wallet, registration, point movement and feedback thread references - and
-- it is created at first sign-in with the SAME id as `user_pk`.
--
-- What it did not carry is the LOGIN. Crystal's members were keyed by email;
-- the platform keys them by `user_id`, and three things now need that string:
--
--   * the blog records an author as a login, not a number, so "my articles"
--     cannot be asked for without it
--   * the storefront identity fallback looks a member up in the legacy
--     customer database by login
--   * the sign-in form shows it back to the member
--
-- It is a MIRROR of ora_pid.users.user_id, refreshed at sign-in, and it is
-- deliberately not unique here: the platform owns that constraint, and a
-- second one in Crystal could only ever disagree with it - refusing a login
-- the platform has already accepted.
--
-- NULL means a member who has not signed in since this shipped. Nothing reads
-- it without a fallback, so those accounts keep working and fill in the first
-- time their owner signs in.
--
-- sql/schema.sql is the source of truth and already says this; this file
-- brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS login varchar(60) NULL;

COMMENT ON COLUMN users.login IS
  'the platform login - a mirror of ora_pid.users.user_id, refreshed at sign-in.
   Not unique here on purpose: the platform owns that constraint, and a second
   one could only ever refuse a login the platform already accepted.';

CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);


/*
 * Backfill from the platform where the two are already in the same database.
 *
 * In development ora_pid is a schema alongside crystal_v1, so the join is
 * possible and every existing member gets their login immediately. In a
 * deployment the vendor's table is in Oracle, the schema does not resolve, and
 * this is skipped - which is correct, because there the column fills in as
 * members sign in.
 */
DO $$
BEGIN
    IF to_regclass('ora_pid.users') IS NOT NULL THEN
        UPDATE users u
           SET login = p.user_id
          FROM ora_pid.users p
         WHERE p.user_pk = u.id
           AND u.login IS DISTINCT FROM p.user_id;
    END IF;
END $$;
