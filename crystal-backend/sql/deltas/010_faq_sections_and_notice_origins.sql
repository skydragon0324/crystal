-- ---------------------------------------------------------------------
-- Delta 010 - three changes that all say the same thing: a support answer
-- and a site notice both belong to ONE OF CRYSTAL'S SYSTEMS, and the reader
-- wants to know which before they read a word of it.
--
--   1. faqs.category is now the SYSTEM the question is about
--      SMARTPHONE | EPRODUCT | ESHOP | APPSTORE | CRYSTAL_APP
--
--      It used to be the TOPIC - warranty, repair, account, OS, order - which
--      is a genuine axis but not the one a visitor arrives on. Somebody with
--      a set-top box problem does not open the FAQ looking for "warranty";
--      they look for the product they are holding. The topic survives in the
--      wording of the question itself, which is where it was already legible.
--
--      The same five values the feedback threads are already routed by
--      (feedback_threads.thread_source), because a question and an enquiry
--      about the same thing should not be filed under two different words.
--
--   2. site_notices gains an ORIGIN
--      Several notices can be live at once now, so "who is telling me this"
--      stops being obvious from the fact that there is only one of them. The
--      origins are their own table rather than a CHECK constraint because
--      they are operational rather than structural: a marketing campaign, a
--      new store, a regulator - somebody in operations adds one, and none of
--      them is worth a release.
--
--   3. the notice is no longer ONE notice
--      Nothing changes in this file for that - the table already carried a
--      sort order and a window. It is the API that stopped answering with
--      `.first()`, and the index below is what keeps the list read cheap.
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. THE FAQ IS FILED BY SYSTEM
-- ---------------------------------------------------------------------

/*
 * The constraint comes off first so the rows can be moved. Dropping it up
 * front rather than at the end is also what makes this file re-runnable: a
 * second pass finds no constraint, moves nothing, and puts it back.
 */
ALTER TABLE faqs DROP CONSTRAINT IF EXISTS chk_faqs_category;

/*
 * THE REMAP ONLY RUNS WHILE THE COLUMN IS STILL TEXT, and that guard is what
 * makes this file replayable.
 *
 * `knex migrate:latest` on an EMPTY database runs the init migration first,
 * and the init migration executes the CURRENT sql/schema.sql - so on a new
 * machine `faqs.category` is already the `crystal_system` enum delta 011
 * introduced, and `category = 'ORDER'` is not a comparison that returns false:
 * ORDER is not a member of that type, so the statement fails outright and a
 * fresh install cannot be migrated at all.
 *
 * There is nothing to remap on that path anyway - the table is empty until the
 * seeds run - so the whole block is skipped rather than made to work.
 */
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute a
          JOIN pg_type t ON t.oid = a.atttypid
         WHERE a.attrelid = 'faqs'::regclass
           AND a.attname = 'category'
           AND t.typtype = 'e'
    ) THEN
        RETURN;
    END IF;

    /* The two that map to a system rather than to a product. */
    UPDATE faqs SET category = 'ESHOP'       WHERE category = 'ORDER';
    UPDATE faqs SET category = 'CRYSTAL_APP' WHERE category = 'ACCOUNT';

    /*
     * Everything else is about a product, so the product's own section
     * decides: a question already pointed at a television is an EPRODUCT one.
     */
    UPDATE faqs SET category = 'EPRODUCT'
     WHERE category NOT IN ('SMARTPHONE','EPRODUCT','ESHOP','APPSTORE','CRYSTAL_APP')
       AND product_category_id IN (
            SELECT id FROM product_categories WHERE type::text <> 'SMARTPHONE'
       );

    /* And a question with no section at all is a handset question - the range
       this company is known for, and the safe default to be wrong in. */
    UPDATE faqs SET category = 'SMARTPHONE'
     WHERE category NOT IN ('SMARTPHONE','EPRODUCT','ESHOP','APPSTORE','CRYSTAL_APP');

    ALTER TABLE faqs
        ADD CONSTRAINT chk_faqs_category
        CHECK (category IN ('SMARTPHONE','EPRODUCT','ESHOP','APPSTORE','CRYSTAL_APP'));
END $$;

COMMENT ON COLUMN faqs.category IS
  'WHICH CRYSTAL SYSTEM the question is about, from the same five the feedback
   threads are routed by. Not the topic: a visitor arrives holding a product,
   not holding a subject heading.';


-- ---------------------------------------------------------------------
-- 2. WHERE A NOTICE CAME FROM
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notice_origins (
    id         serial       PRIMARY KEY,

    /* The natural key the seeds and any import address an origin by. */
    code       varchar(40)  NOT NULL UNIQUE,
    name       varchar(120) NOT NULL,

    /*
     * The badge colour, as a hex.
     *
     * Paintable before anything has loaded, which is the whole reason it is a
     * colour rather than a logo: the notice list shows six origins at once and
     * a reader picks their own out by colour long before they read the label.
     */
    colour     varchar(7)   NULL,

    sort_order integer      NOT NULL DEFAULT 0,
    status     varchar(20)  NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','INACTIVE')),
    is_deleted boolean      NOT NULL DEFAULT false,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE notice_origins IS
  'who a site notice is FROM - a team, a campaign, a regulator. Its own table
   rather than a CHECK constraint because the list is operational: somebody in
   operations adds one, and none of them is worth a release.';
COMMENT ON COLUMN notice_origins.colour IS
  'hex, for the badge. A reader picks their own origin out of a list of six by
   colour before they read a single label.';

DO $$
BEGIN
    CREATE TRIGGER trg_notice_origins_updated
        BEFORE UPDATE ON notice_origins
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE site_notices
    ADD COLUMN IF NOT EXISTS origin_id integer NULL;

DO $$
BEGIN
    ALTER TABLE site_notices
        ADD CONSTRAINT fk_site_notices_origin
        FOREIGN KEY (origin_id) REFERENCES notice_origins(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN site_notices.origin_id IS
  'who it is from. NULL is allowed and means Crystal itself, so an origin that
   is later retired does not take its notices with it - ON DELETE SET NULL.';

CREATE INDEX IF NOT EXISTS idx_site_notices_origin ON site_notices(origin_id);


/*
 * THE CONSOLE SCREEN THE NEW TABLE IS EDITED ON.
 *
 * A route whose admin_pages row is missing is refused with a 500 that says
 * so - deliberately, see middleware/permission.js - so registering the page
 * is part of shipping the table rather than a follow-up seed. It inherits the
 * grants on /admin/base by prefix, so no role has to be edited.
 */
INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT '/admin/base/notice-origins', 'Notice origins', 'MdLabelOutline',
       COALESCE((SELECT sort_order + 5 FROM manager_pages WHERE page_url = '/admin/base/notices'), 900),
       true,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/base')
WHERE NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/base/notice-origins');

/* The notices screen is no longer only a popup, so it is no longer named one. */
UPDATE manager_pages SET page_name = 'Site notices'
 WHERE page_url = '/admin/base/notices' AND page_name = 'Popup notices';


-- ---------------------------------------------------------------------
-- 3. MORE THAN ONE NOTICE AT A TIME
--
-- The storefront reads every live notice now rather than the top one, so the
-- ordering is a range scan over the whole live set rather than a lookup of
-- its first row. Same columns, stated in the order the query reads them.
-- ---------------------------------------------------------------------

DROP INDEX IF EXISTS idx_site_notices_live;
CREATE INDEX idx_site_notices_live
    ON site_notices(status, is_deleted, sort_order DESC, id DESC);

COMMENT ON COLUMN site_notices.sort_order IS
  'higher shows first. It used to decide WHICH single notice was shown; now
   that they all are, it decides the order they are read in.';
