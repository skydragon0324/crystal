-- ---------------------------------------------------------------------
-- Delta 054 - customer lifecycle KPIs: the analytics read models.
--
-- Seven tables that together hold a login-based lifecycle classification for
-- every platform customer, its full history, and the state of the jobs that
-- keep it current. See CUSTOMER_LIFECYCLE_KPI_REQUIREMENTS.md section 7.
--
-- NOTHING HERE IS A SOURCE OF TRUTH. Oracle owns registrations and logins
-- (bs_prhnid.users, bs_prhnid.user_login_log); every table below is DERIVED and
-- may be rebuilt from Oracle plus lifecycle_login_event. That is the whole
-- reason the journal exists: a rebuild must not mean re-reading a million
-- Oracle rows.
--
-- NO FOREIGN KEY REACHES ORACLE. user_pk is the vendor's key, in another
-- database, so it is carried as a plain bigint - the same arrangement
-- bs_prhnid.feedback_threads.user_pk already has, and for the same reason.
--
-- WHAT IS DELIBERATELY NOT COPIED: passwords, id_card, cid, phone_imei,
-- phone_brand and phone_model. None is needed to count statuses, and
-- requirement 3 is explicit that they stay out of the analytics store.
--
-- Safe to run twice; a database built from schema.sql already has it.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 7.1  the reporting profile
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_customer_profile (
    user_pk               bigint       PRIMARY KEY,
    user_id               varchar(60)  NULL,
    user_name             varchar(120) NULL,
    birthday              date         NULL,
    job_code              smallint     NULL,
    location_pk           bigint       NULL,

    /*
     * ONE DETERMINISTIC DISPLAY PHONE, chosen by the newest updated_at and
     * then by phone_pk - bs_prhnid.user_phone_numbers has no primary flag, so
     * this is a presentation choice and must never be described to an
     * operator as a verified primary number. A report row joins to this one
     * column rather than to the phone table, which is what stops a customer
     * with three handsets from appearing three times in a count.
     */
    display_phone         varchar(40)  NULL,

    /* bs_prhnid.users.status (0/1) - the OPERATIONAL account flag, kept beside
       the lifecycle status and never conflated with it. */
    oracle_account_status smallint     NULL,

    registered_at         timestamptz  NOT NULL,
    source_updated_at     timestamptz  NULL,
    synced_at             timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE lifecycle_customer_profile IS
  'Reporting copy of bs_prhnid.users, minus everything a lifecycle count does not
   need. Derived: safe to rebuild from the source.';
COMMENT ON COLUMN lifecycle_customer_profile.display_phone IS
  'One number for report rows, newest updated_at then phone_pk. NOT a verified
   primary - the source has no such flag.';
COMMENT ON COLUMN lifecycle_customer_profile.oracle_account_status IS
  'bs_prhnid.users.status, the operational account flag. Not a lifecycle status.';

CREATE INDEX IF NOT EXISTS idx_lifecycle_profile_registered
    ON lifecycle_customer_profile(registered_at);
CREATE INDEX IF NOT EXISTS idx_lifecycle_profile_user_id
    ON lifecycle_customer_profile(user_id);


-- ---------------------------------------------------------------------
-- 7.2  the minimal login journal
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_login_event (
    /* bs_prhnid.user_login_log.TABLE_PK - the key that makes an import
       idempotent however many times a batch is replayed. */
    source_table_pk bigint      PRIMARY KEY,
    user_pk         bigint      NOT NULL,
    action_at       timestamptz NOT NULL,
    ingested_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lifecycle_login_event IS
  'Minimal idempotent journal of login instants: the three columns a timeline
   needs. No device, SIM or handset identity is copied here (requirement 3).';

/* The access path for rebuilding one customer's timeline. */
CREATE INDEX IF NOT EXISTS idx_lifecycle_login_user_time
    ON lifecycle_login_event(user_pk, action_at, source_table_pk);
/* And for "what arrived since", which the reconciliation job walks. */
CREATE INDEX IF NOT EXISTS idx_lifecycle_login_ingested
    ON lifecycle_login_event(ingested_at);


-- ---------------------------------------------------------------------
-- 7.3  current state, one row per customer
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_customer_current (
    user_pk                    bigint      PRIMARY KEY
        REFERENCES lifecycle_customer_profile(user_pk) ON DELETE CASCADE,
    status                     varchar(10) NOT NULL,
    status_since               timestamptz NOT NULL,
    last_login_at              timestamptz NULL,
    effective_last_activity_at timestamptz NOT NULL,

    /*
     * WHEN THIS CUSTOMER CHANGES STATUS ON ITS OWN, if nobody logs in. The
     * deadline processor selects on exactly this column, which is why the
     * index below is partial: the rows that matter tonight are the few with a
     * due time, not the whole population.
     */
    next_transition_at         timestamptz NULL,
    computed_at                timestamptz NOT NULL DEFAULT now(),
    rule_version               integer     NOT NULL DEFAULT 1,

    CONSTRAINT chk_lifecycle_current_status
        CHECK (status IN ('NEW', 'ACTIVE', 'DORMANT', 'CHURNED'))
);

COMMENT ON TABLE lifecycle_customer_current IS
  'The status now. A cache of the open row in lifecycle_customer_period, kept
   because every list and card reads it.';

CREATE INDEX IF NOT EXISTS idx_lifecycle_current_due
    ON lifecycle_customer_current(next_transition_at)
 WHERE next_transition_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_current_status
    ON lifecycle_customer_current(status);


-- ---------------------------------------------------------------------
-- 7.4  the historical truth
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_customer_period (
    id              bigserial   PRIMARY KEY,
    user_pk         bigint      NOT NULL,
    status          varchar(10) NOT NULL,

    /* NULL only on the registration row. Every other row IS a transition. */
    previous_status varchar(10) NULL,

    /*
     * HALF-OPEN: [valid_from, valid_to). The instant in valid_to belongs to
     * the next period, which is what makes "status at T" a containment test
     * with no tie to break, and what makes a day's end mean the same thing
     * everywhere.
     */
    valid_from      timestamptz NOT NULL,
    valid_to        timestamptz NULL,

    reason          varchar(30) NOT NULL,
    rule_version    integer     NOT NULL DEFAULT 1,
    computed_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_lifecycle_period_status
        CHECK (status IN ('NEW', 'ACTIVE', 'DORMANT', 'CHURNED')),
    CONSTRAINT chk_lifecycle_period_previous
        CHECK (previous_status IS NULL
               OR previous_status IN ('NEW', 'ACTIVE', 'DORMANT', 'CHURNED')),
    /* An ACTIVE -> ACTIVE row is not a transition; a login that changes
       nothing extends the period instead. Refused here as well as in the
       builder, because this table is the thing reports are counted from. */
    CONSTRAINT chk_lifecycle_period_moved
        CHECK (previous_status IS NULL OR previous_status <> status),
    CONSTRAINT chk_lifecycle_period_ordered
        CHECK (valid_to IS NULL OR valid_to > valid_from)
);

COMMENT ON TABLE lifecycle_customer_period IS
  'Canonical lifecycle history as non-overlapping half-open intervals. Every
   row but the registration row is a transition event.';

/* One period may begin per customer per instant. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_lifecycle_period_start
    ON lifecycle_customer_period(user_pk, valid_from);
/* And exactly one may be left open. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_lifecycle_period_open
    ON lifecycle_customer_period(user_pk)
 WHERE valid_to IS NULL;

/* The transition matrix and the transition list both read this. */
CREATE INDEX IF NOT EXISTS idx_lifecycle_period_flow
    ON lifecycle_customer_period(previous_status, status, valid_from DESC);
/* Snapshot building and any "as of" query walk by instant. */
CREATE INDEX IF NOT EXISTS idx_lifecycle_period_from
    ON lifecycle_customer_period(valid_from);
/* One customer's timeline, in order. */
CREATE INDEX IF NOT EXISTS idx_lifecycle_period_user
    ON lifecycle_customer_period(user_pk, valid_from);


-- ---------------------------------------------------------------------
-- 7.5  daily stock snapshots
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_kpi_daily (
    /* A calendar day in the REPORT timezone, not UTC and not server-local. */
    snapshot_date    date        PRIMARY KEY,

    new_count        bigint      NOT NULL DEFAULT 0,
    active_count     bigint      NOT NULL DEFAULT 0,
    dormant_count    bigint      NOT NULL DEFAULT 0,
    churned_count    bigint      NOT NULL DEFAULT 0,
    total_count      bigint      NOT NULL DEFAULT 0,

    /* Registrations DURING the day - a flow, and not the same number as the
       NEW population at the day's end. Requirement 5 is emphatic about it. */
    registered_count bigint      NOT NULL DEFAULT 0,

    rule_version     integer     NOT NULL DEFAULT 1,
    /* False while the day may still be changed by a late event that
       reconciliation has not looked for yet. */
    is_final         boolean     NOT NULL DEFAULT false,
    recalculated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_lifecycle_kpi_nonnegative
        CHECK (new_count >= 0 AND active_count >= 0 AND dormant_count >= 0
               AND churned_count >= 0 AND total_count >= 0
               AND registered_count >= 0),
    /* The invariant from requirement 10, enforced by the database rather than
       hoped for by the job that writes it. */
    CONSTRAINT chk_lifecycle_kpi_sums
        CHECK (total_count = new_count + active_count + dormant_count + churned_count)
);

COMMENT ON TABLE lifecycle_kpi_daily IS
  'One row per calendar day in the report timezone: the four stock counts
   immediately before the next local midnight, plus that day registration
   flow. Never summed across days to make a population.';
COMMENT ON COLUMN lifecycle_kpi_daily.registered_count IS
  'Registrations during the day - a FLOW. Not the NEW stock at day end.';


-- ---------------------------------------------------------------------
-- 7.6  business events to compare around
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_business_event (
    event_id    serial       PRIMARY KEY,
    name        varchar(120) NOT NULL,
    description text         NULL,
    category    varchar(40)  NULL,
    event_at    timestamptz  NOT NULL,
    created_by  integer      NULL REFERENCES managers(id) ON DELETE SET NULL,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE lifecycle_business_event IS
  'Named instants to compare cohorts and flows around. A before/after
   comparison is a correlation and the UI must not present it as a cause.';

CREATE INDEX IF NOT EXISTS idx_lifecycle_event_at
    ON lifecycle_business_event(event_at DESC);

DROP TRIGGER IF EXISTS trg_lifecycle_event_updated ON lifecycle_business_event;
CREATE TRIGGER trg_lifecycle_event_updated
    BEFORE UPDATE ON lifecycle_business_event
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ---------------------------------------------------------------------
-- 7.7  where the jobs got to, and how they went
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_sync_checkpoint (
    /* One row per cursor - 'login', 'profile', 'reconcile'. */
    stream              varchar(40)  PRIMARY KEY,

    /*
     * THE HIGH-WATER KEY, AND WHY IT IS NOT ENOUGH ON ITS OWN. TABLE_PK is
     * assigned before commit, so a transaction that commits late can leave a
     * key below the watermark unread for ever. The overlap window re-reads a
     * configurable band below it, and the reconciliation stream below is what
     * actually closes the hole. Documented in job health, not hidden.
     */
    last_source_pk      bigint       NULL,
    last_source_at      timestamptz  NULL,
    last_success_at     timestamptz  NULL,
    last_reconciled_at  timestamptz  NULL,
    rows_ingested       bigint       NOT NULL DEFAULT 0,
    rule_version        integer      NOT NULL DEFAULT 1,
    updated_at          timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE lifecycle_sync_checkpoint IS
  'Per-stream ingestion cursor. last_source_pk is a watermark, not a
   guarantee: see the column comment and the reconciliation job.';

DROP TRIGGER IF EXISTS trg_lifecycle_checkpoint_updated ON lifecycle_sync_checkpoint;
CREATE TRIGGER trg_lifecycle_checkpoint_updated
    BEFORE UPDATE ON lifecycle_sync_checkpoint
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE IF NOT EXISTS lifecycle_job_run (
    id            bigserial    PRIMARY KEY,
    job           varchar(40)  NOT NULL,
    status        varchar(20)  NOT NULL,
    started_at    timestamptz  NOT NULL DEFAULT now(),
    finished_at   timestamptz  NULL,
    rows_read     bigint       NOT NULL DEFAULT 0,
    rows_written  bigint       NOT NULL DEFAULT 0,
    customers_rebuilt bigint   NOT NULL DEFAULT 0,
    /* Days whose snapshots this run marked dirty or recomputed. */
    dates_touched integer      NOT NULL DEFAULT 0,
    error         text         NULL,
    /* Who asked, when an operator asked. NULL for the schedule. */
    requested_by  integer      NULL REFERENCES managers(id) ON DELETE SET NULL,

    CONSTRAINT chk_lifecycle_job_status
        CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'))
);

COMMENT ON TABLE lifecycle_job_run IS
  'One row per job execution, including the skipped ones: a run that found the
   advisory lock held is a fact worth keeping.';

CREATE INDEX IF NOT EXISTS idx_lifecycle_job_recent
    ON lifecycle_job_run(job, started_at DESC);


-- ---------------------------------------------------------------------
-- the exception channel
-- ---------------------------------------------------------------------
-- Requirement 9: an event with no timestamp, one before its customer
-- registered, one from the future or one for a customer nobody knows is a
-- data-quality fact. It goes here, where job health can show it, rather than
-- being dropped or guessed at.
CREATE TABLE IF NOT EXISTS lifecycle_exception (
    id          bigserial    PRIMARY KEY,
    kind        varchar(40)  NOT NULL,
    user_pk     bigint       NULL,
    source_table_pk bigint   NULL,
    action_at   timestamptz  NULL,
    detail      text         NULL,
    noticed_at  timestamptz  NOT NULL DEFAULT now(),
    resolved_at timestamptz  NULL
);

COMMENT ON TABLE lifecycle_exception IS
  'Source rows that could not be classified, kept visible instead of silently
   misclassified.';

CREATE INDEX IF NOT EXISTS idx_lifecycle_exception_open
    ON lifecycle_exception(kind, noticed_at DESC)
 WHERE resolved_at IS NULL;
