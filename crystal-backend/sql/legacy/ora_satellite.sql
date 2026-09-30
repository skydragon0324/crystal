-- =====================================================================
-- ora_license, ora_media, ora_old_db - THE THREE SATELLITE DATABASES,
-- as a development stand-in.
--
-- None of these tables are Crystal's. They belong to the systems that ran
-- before this platform existed - the karaoke keygen service, the broadcast
-- media service, and the old customer database - and Crystal reads three
-- history pages out of them and writes nothing at all.
--
-- WHY THEY ARE READ AT ALL
--
-- A member's licence and prize history did not start when Crystal did. The
-- vendor's site has three "old log" pages for exactly this: what you did
-- before, in the system that recorded it. Leaving them out would tell a
-- member with years of history that they have none.
--
-- WHY THIS FILE EXISTS
--
-- There is no Oracle on a development machine, so all three pages would
-- answer 500. This creates the same schemas as ordinary schemas in the
-- PostgreSQL database Crystal already uses, under the same names the queries
-- qualify with - so the repository code is identical either way and nothing
-- above it knows which it is talking to.
--
-- IF NOT EXISTS THROUGHOUT. On a machine where the vendor's converted
-- schemas are already present - which is the normal case - this changes
-- nothing and the real tables are used as they stand.
--
-- TABLE NAMES ARE THE VENDOR'S TOO, and that is not cosmetic. These were
-- once spelled the way Crystal would have spelled them - keygen_karaoke_log,
-- media_license_log, media_provider, media_score - which read better and
-- meant the stand-in was the ONLY database the repositories could run
-- against. `ora_license.tbl_licgen` and the rest are what
-- vendor_backend/models/eprodModel.js opens, so they are what is created
-- here; pointing the same code at the real Oracle is now a setting rather
-- than a rewrite.
--
-- COLUMN NAMES ARE THE VENDOR'S, not Crystal's. `machinekey` is one word,
-- `resultlog` is one word, `is_agent` is a number and not a boolean, and
-- `bonus_score` means something different in each of the two licence tables.
-- All of that is fixed by the systems that own these rows; renaming any of
-- it here would mean the repository could not be pointed at the real thing.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS ora_license;
CREATE SCHEMA IF NOT EXISTS ora_media;
CREATE SCHEMA IF NOT EXISTS ora_old_db;

-- ---------------------------------------------------------------------
-- ora_license - the karaoke keygen service
-- ---------------------------------------------------------------------

/*
 * One row per keying attempt, successful or not.
 *
 * `resultlog` is 0 for success and anything else for a failure, which is the
 * opposite of what the name suggests and is why the query says so out loud.
 * `is_agent` records whether a shop did the keying on the member's behalf.
 */
CREATE TABLE IF NOT EXISTS ora_license.tbl_licgen (
  id          bigint        PRIMARY KEY,
  userid      varchar(50)   NULL,
  machinekey  varchar(64)   NULL,
  real_price  numeric(10,3) NOT NULL DEFAULT 0,
  bonus_score numeric(10,3) NOT NULL DEFAULT 0,
  is_agent    smallint      NOT NULL DEFAULT 0,
  resultlog   smallint      NOT NULL DEFAULT 0,
  created_at  timestamp     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tbl_licgen_userid_idx
  ON ora_license.tbl_licgen (userid, created_at DESC);

/*
 * Faults raised against a keying, joined back by licence id.
 *
 * A row here does not by itself disqualify the keying - only `error_status`
 * 2 does, which is the code the service uses for "reversed". Everything else
 * is a note, and a keying with no row at all is simply fine.
 */
CREATE TABLE IF NOT EXISTS ora_license.tbl_error_list (
  id           bigint       PRIMARY KEY,
  lic_id       bigint       NULL,
  error_status smallint     NOT NULL DEFAULT 0,
  note         varchar(512) NULL,
  created_at   timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tbl_error_list_lic_idx
  ON ora_license.tbl_error_list (lic_id);

-- ---------------------------------------------------------------------
-- ora_media - the broadcast media service
-- ---------------------------------------------------------------------

/* `result` is 1 for success here, the opposite convention to the karaoke
   table above. Both are transcribed as they are. */
CREATE TABLE IF NOT EXISTS ora_media.tbl_licenses (
  id          bigint        PRIMARY KEY,
  userid      varchar(50)   NULL,
  dev_id      varchar(64)   NULL,
  provider    bigint        NULL,
  cal_price   numeric(10,3) NOT NULL DEFAULT 0,
  bonus_score numeric(10,3) NOT NULL DEFAULT 0,
  result      smallint      NOT NULL DEFAULT 0,
  date_time   timestamp     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tbl_licenses_userid_idx
  ON ora_media.tbl_licenses (userid, date_time DESC);

CREATE TABLE IF NOT EXISTS ora_media.tbl_media_providers (
  id         bigint       PRIMARY KEY,
  short_name varchar(100) NULL,
  full_name  varchar(255) NULL,
  contact    varchar(64)  NULL
);

/*
 * THE CARRY-FORWARD ROW, and there is at most one per member.
 *
 * It is not a licence. It is the balance a member brought with them when the
 * media service started keeping a log at all, and the vendor appends it as
 * the last line of the last page so the column adds up. `score` is stored in
 * fifteenths of a point, which is why the query divides.
 */
CREATE TABLE IF NOT EXISTS ora_media.tbl_old_license_score (
  id        bigint        PRIMARY KEY,
  userid    varchar(50)   NULL,
  cal_price numeric(10,3) NOT NULL DEFAULT 0,
  score     numeric(10,3) NOT NULL DEFAULT 0,
  status    smallint      NOT NULL DEFAULT 0,
  date_time timestamp     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tbl_old_license_score_userid_idx
  ON ora_media.tbl_old_license_score (userid);

-- ---------------------------------------------------------------------
-- ora_old_db - the customer database that predates the platform
-- ---------------------------------------------------------------------

/*
 * Already referenced by identity.repository.js, which resolves a member's
 * storefront key by login when no merge row exists. It was never created by
 * the stand-in, so that fallback has always silently failed in development -
 * the lookup swallows the error and answers "no key". Creating it here makes
 * the fallback exercisable, which is the point of a stand-in.
 *
 * THE COLUMNS ARE THE VENDOR'S, read off a converted instance rather than
 * guessed. An earlier version of this file invented a "unique_id" column
 * that does not exist - and because the table was already present the
 * CREATE was a no-op, so the mistake surfaced only on the INSERT.
 */
CREATE TABLE IF NOT EXISTS ora_old_db.customers (
  user_pk       integer      PRIMARY KEY,
  user_name     varchar(120) NULL,
  user_sex      smallint     NULL,
  user_birthday varchar(20)  NULL,
  user_password varchar(120) NULL,
  user_userid   varchar(60)  NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_userid_idx
  ON ora_old_db.customers (user_userid);

/* Activity prizes, awarded by hand with a note saying what for. */
CREATE TABLE IF NOT EXISTS ora_old_db.customer_prize_log (
  id          integer       PRIMARY KEY,
  customer_id integer       NOT NULL,
  prize_val   numeric(12,2) NOT NULL DEFAULT 0,
  note        varchar(400)  NULL,
  fill_date   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_prize_log_customer_idx
  ON ora_old_db.customer_prize_log (customer_id, fill_date DESC);
