-- =====================================================================
-- ora_pid - THE VENDOR'S FEEDBACK TABLES, as a development stand-in.
--
-- These two tables are NOT Crystal's. They live in the vendor's Oracle
-- instance, they are read and written by the vendor's own console as well as
-- by this application, and their shape is fixed: Crystal must not alter it.
-- The DDL below is a transcription of the Oracle original, which is:
--
--   CREATE TABLE feedback_threads (
--     thread_pk NUMBER PRIMARY KEY,
--     user_pk NUMBER NOT NULL,
--     title VARCHAR2(512) NOT NULL,
--     category NUMBER(2) DEFAULT 0 NOT NULL,
--     thread_source NUMBER(1) DEFAULT 0,
--     last_message VARCHAR2(4000),
--     last_type NUMBER(1) DEFAULT 0,
--     status NUMBER(1) DEFAULT 0,
--     is_read NUMBER(1) DEFAULT 0,
--     is_deleted NUMBER(1) DEFAULT 0,
--     session_by NUMBER,
--     created_at DATE DEFAULT CURRENT_TIMESTAMP,
--     updated_at DATE DEFAULT CURRENT_TIMESTAMP,
--     ... FK user_pk -> users, FK session_by -> managers
--   );
--
-- WHY THIS FILE EXISTS
--
-- There is no Oracle instance on a development machine, so every feedback
-- page would answer 500. This creates the same two tables as ordinary schemas
-- in the PostgreSQL database Crystal already uses, under the same name the
-- Oracle schema has - `ora_pid` - so that repositories/legacy/ can address
-- them as `ora_pid.feedback_threads` and have that one string be correct on
-- both drivers. See src/config/legacy.js.
--
-- It is a STAND-IN, not a migration target. Do not point knex at it and do
-- not add columns Crystal would like to have: the production table will not
-- have them, and the only thing worse than a missing column is one that works
-- in development.
--
--   npm run legacy:install     creates it, then seeds it
--
-- Re-runnable: everything is IF NOT EXISTS.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS ora_pid;


-- ---------------------------------------------------------------------
-- TYPE CHOICES, and why each one is not the type Crystal would pick.
--
--   NUMBER          -> bigint    the pks are Oracle NUMBERs with no scale
--   NUMBER(1)/(2)   -> smallint  the coded vocabularies; see
--                                repositories/legacy/codes.js for what each
--                                number means. They are NOT booleans and NOT
--                                enums here, because they are not in Oracle.
--   VARCHAR2(n)     -> varchar(n)
--   DATE            -> timestamp(0)  Oracle's DATE carries a time to the
--                                second and no timezone. `timestamptz` would
--                                be the better column and is the wrong one:
--                                it would make development accept values
--                                production silently truncates.
--
-- The thread pk is a plain bigint with a sequence default rather than an
-- identity column, because Oracle allocates it in a BEFORE INSERT trigger off
-- FEEDBACK_THREADS_S. An insert that omits the pk works on both; an insert
-- that supplies one also works on both. That is the behaviour being copied.
-- ---------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS ora_pid.feedback_threads_s START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS ora_pid.feedback_messages_s START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS ora_pid.feedback_threads (
    thread_pk     bigint        PRIMARY KEY DEFAULT nextval('ora_pid.feedback_threads_s'),

    /*
     * users.user_pk IN ORACLE, which is a different database from the one
     * holding crystal_v1.users - so there is no foreign key here and there
     * cannot be one. The identity bridge is documented in
     * repositories/legacy/feedback.repository.js: Crystal treats users.id and
     * user_pk as the same number for the same person, and stitches the member
     * onto the thread in JS after two separate queries.
     */
    user_pk       bigint        NOT NULL,

    title         varchar(512)  NOT NULL,

    /* The vendor's own filing. Crystal neither reads nor writes it; the
       column DEFAULT is what fills it in. */
    category      smallint      NOT NULL DEFAULT 0,

    /* Which Crystal system the enquiry came from - enquiry_source, by ordinal. */
    thread_source smallint      DEFAULT 0,

    last_message  varchar(4000) NULL,

    /* Which side wrote last: 0 user, 1 manager. */
    last_type     smallint      DEFAULT 0,

    /* 0 discussing, 1 resolved, 2 finished. Crystal's PENDING/REPLIED split
       lives in last_type, not here - see codes.js. */
    status        smallint      DEFAULT 0,

    is_read       smallint      DEFAULT 0,
    is_deleted    smallint      DEFAULT 0,

    /* managers.manager_pk in Oracle; Crystal's admins.id. Again no FK. */
    session_by    bigint        NULL,

    created_at    timestamp(0)  DEFAULT CURRENT_TIMESTAMP,
    updated_at    timestamp(0)  DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_feedback_threads_user
    ON ora_pid.feedback_threads (user_pk, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_feedback_threads_state
    ON ora_pid.feedback_threads (status, thread_source, updated_at DESC);


CREATE TABLE IF NOT EXISTS ora_pid.feedback_messages (
    message_pk  bigint        PRIMARY KEY DEFAULT nextval('ora_pid.feedback_messages_s'),
    thread_pk   bigint        NOT NULL
                              REFERENCES ora_pid.feedback_threads (thread_pk),

    /*
     * VARCHAR2(4000), not a LOB - so a message has a hard 4000-BYTE ceiling in
     * production and the service truncates to it. varchar(4000) here counts
     * CHARACTERS, which is more generous than Oracle for anything non-ASCII;
     * the length check lives in the service so both drivers agree.
     */
    message     varchar(4000) NOT NULL,

    /* 0 user, 1 manager. */
    action_type smallint      NOT NULL DEFAULT 0,

    /* users.user_pk when action_type is 0, managers.manager_pk when it is 1. */
    action_by   bigint        NOT NULL,

    action_at   timestamp(0)  DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_feedback_messages_thread
    ON ora_pid.feedback_messages (thread_pk, action_at);


/*
 * NO updated_at TRIGGER, deliberately.
 *
 * Crystal's own feedback_threads has one - set_updated_at_unless_read() -
 * because the console's queue sorts by updated_at and marking a thread read
 * must not jump it to the top. The Oracle table has no trigger at all: every
 * write there sets updated_at explicitly, from the application.
 *
 * So the stand-in has none either. Adding one would make development quietly
 * correct in a way production is not, and the bug it hides is the queue
 * reordering itself under a manager who has just clicked a row.
 */

-- ---------------------------------------------------------------------
-- user_merge_log - WHEN an account became one account
-- ---------------------------------------------------------------------

/*
 * One row per merge or split, and it is not the same table as
 * `user_merge_ids`. That one says who a member is in each system; this one
 * says when they became one account, which is the only thing that can answer
 * "where does their OLD history stop".
 *
 * `merge_type` 0 is a MERGE and 1 is a SPLIT - the opposite way round from
 * how it reads. `id_type` 0 means the row is keyed by the fixed id the
 * platform issues.
 *
 * Read by repositories/legacy/oldlogs.repository.js and nowhere else. An
 * account with no row here has never been merged, and its whole history
 * shows - which is the ordinary case and not an error.
 */
CREATE TABLE IF NOT EXISTS ora_pid.user_merge_log (
  table_pk    bigint       PRIMARY KEY,
  pvendor_pk  bigint       NOT NULL,
  pvendor_id  varchar(60)  NOT NULL,
  id_type     smallint     NOT NULL,
  merge_id    varchar(60)  NULL,
  merge_type  smallint     NOT NULL DEFAULT 0,
  action_at   timestamp    NULL DEFAULT CURRENT_TIMESTAMP,
  action_type smallint     NOT NULL DEFAULT 0,
  action_by   bigint       NOT NULL
);

CREATE INDEX IF NOT EXISTS user_merge_log_lookup_idx
  ON ora_pid.user_merge_log (id_type, merge_id, action_at DESC);
