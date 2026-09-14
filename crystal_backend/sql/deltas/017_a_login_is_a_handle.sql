-- ---------------------------------------------------------------------
-- Delta 017 - a login counts as a way to reach an account.
--
-- `chk_user_has_a_handle` required an email or a phone number, and its own
-- comment said why: "an account with neither an email nor a phone could never
-- sign in again."
--
-- That reason expired when sign-in moved to ora_pid.users. A member signs in
-- with a USER ID now; the email is for contacting them and plenty of platform
-- accounts have never had one. The constraint was refusing exactly the row
-- registration is supposed to create - a member with a login, no email and no
-- phone, which is the ordinary case on this platform rather than an edge one.
--
-- So `login` joins the other two. The rule is unchanged in spirit: an account
-- still has to carry at least one way of identifying the person behind it. It
-- is only that the list of what counts was written before the login existed.
--
-- sql/schema.sql is the source of truth and already says this; this file
-- brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_has_a_handle;

ALTER TABLE users
    ADD CONSTRAINT chk_user_has_a_handle
    CHECK (login IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL);

COMMENT ON CONSTRAINT chk_user_has_a_handle ON users IS
  'an account has to carry at least one way of identifying the person behind it.
   `login` leads because it is the one sign-in actually uses - it mirrors
   ora_pid.users.user_id; the other two are for reaching somebody.';
