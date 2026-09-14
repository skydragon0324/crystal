-- ---------------------------------------------------------------------
-- Delta 013 - a console account is a username, a password and a role.
--
-- Two columns go, for two different reasons.
--
--   EMAIL was unique, nullable, and read by nothing. The console's sign-in
--   has always matched on `username` - see managers.repository.findForSignIn -
--   so the address was never a credential, and no screen sent to it. A
--   nullable unique column that no query touches is a column that can only
--   ever be wrong. A manager's contact details belong wherever the company
--   keeps staff records, not in the table that authenticates them.
--
--   AGENCY_ID pinned an account to one service centre, and eight controllers
--   narrowed their reads through it: a branch manager saw their own tickets,
--   stock, technicians, replenishments, claim and scoreboard row, and nobody
--   else's. That was a real feature and this delta removes it deliberately -
--   what an account may do is answered by the permission grid alone from
--   here on, and any role that can open a screen sees the whole estate on it.
--
--   THIS ONE LOSES INFORMATION. Which centre each account belonged to is not
--   recorded anywhere else, so `down` cannot put it back - see the migration.
--   Nothing else in the schema depended on it: no view read it, and the FK
--   pointed outward at agencies rather than inward.
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

ALTER TABLE managers DROP CONSTRAINT IF EXISTS fk_admins_agency;

DROP INDEX IF EXISTS idx_admins_agency;

ALTER TABLE managers DROP COLUMN IF EXISTS agency_id;
ALTER TABLE managers DROP COLUMN IF EXISTS email;

COMMENT ON TABLE managers IS
  'A CONSOLE ACCOUNT: a username, a password and a role.

   It used to carry an agency_id as well, pinning an account to one service
   centre, and eight controllers narrowed their reads through it. That scoping
   is gone with the column: what an account may do is now answered by the
   permission grid alone.';
