-- ---------------------------------------------------------------------
-- Delta 009 - the notice that greets a visitor.
--
-- A dialog on arrival is the most intrusive thing a website can do, so the
-- table is shaped to make the intrusion answerable rather than permanent:
--
--   it has a WINDOW      starts_at / ends_at, so a notice about a sale stops
--                        appearing when the sale ends without anybody
--                        remembering to switch it off
--   it can be DISMISSED  the visitor says "not today" and it stays away for
--                        the rest of the day
--   it has an ORDER      two live notices show the higher one; a queue of
--                        modals is not a greeting, it is an obstacle
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_notices (
    id           serial       PRIMARY KEY,
    title        varchar(200) NOT NULL,

    /*
     * The body, as HTML from the console's rich text editor - the same editor
     * the blog uses, so a notice can carry a link and a line break without a
     * second content format existing.
     */
    content      text         NOT NULL,

    /*
     * PUBLISHED is necessary but not sufficient: the window below decides
     * whether a published notice is live RIGHT NOW. Two switches because
     * writing a notice in advance and taking one down are different acts.
     */
    status       varchar(20)  NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT','PUBLISHED')),

    starts_at    timestamptz  NULL,
    ends_at      timestamptz  NULL,

    /*
     * Whether "do not remind me today" is offered.
     *
     * Off for the rare notice that genuinely must be read - a service
     * interruption, a security notice - and on for everything else, because a
     * greeting nobody can put down is an advertisement.
     */
    dismissible  boolean      NOT NULL DEFAULT true,

    -- Higher shows first; only the top live notice is shown at all.
    sort_order   integer      NOT NULL DEFAULT 0,

    is_deleted   boolean      NOT NULL DEFAULT false,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_notices IS
  'the popup shown to a visitor on arrival at the storefront';
COMMENT ON COLUMN site_notices.starts_at IS
  'NULL means "already started"; with ends_at it is the window the notice is live in';
/*
 * THE COMMENT ONLY RUNS IF THE COLUMN IS STILL THERE, and that guard is what
 * keeps this file replayable.
 *
 * `knex migrate:latest` on an EMPTY database runs the init migration first,
 * and the init migration executes the CURRENT sql/schema.sql - where delta 018
 * has already removed `dismissible`. The CREATE TABLE above is IF NOT EXISTS
 * and so does nothing on that path, and a COMMENT on a column that was never
 * created is not a no-op: it raises, and a fresh install cannot be migrated.
 *
 * The same shape as the guards in deltas 002 and 010, and found the same way -
 * by npm run migrate:verify, which builds the whole chain from empty.
 */
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'site_notices' AND column_name = 'dismissible'
    ) THEN
        COMMENT ON COLUMN site_notices.dismissible IS
          'whether the visitor is offered "do not remind me today"';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_site_notices_live
    ON site_notices(status, sort_order DESC, starts_at);

DO $$
BEGIN
    CREATE TRIGGER trg_site_notices_updated
        BEFORE UPDATE ON site_notices
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
