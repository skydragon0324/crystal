-- 033  The FAQ is filed by the product in the visitor's hands
--
--   faqs.category      crystal_system -> faq_category
--                      SMARTPHONE | TV | STB | COMPUTER | CAMERA
--                      | CRYSTAL_APP | ESHOP | APPSTORE
--   faqs.product_category_id   dropped - the "section" the console asked for
--   crystal_system     dropped - nothing else used it
--
-- WHY. An answer was filed twice: under a SYSTEM (SMARTPHONE, EPRODUCT, ESHOP,
-- APPSTORE, CRYSTAL_APP), and again under a catalogue SECTION that said which
-- eproduct it was really about. Every television, set-top box, computer and
-- camera question shared one word, EPRODUCT, and the section field that told
-- them apart was one more select on the console form that nobody could say
-- what to put in. The categories are now the catalogue's own product kinds
-- (product_kind, value for value) and the three services that are not
-- products, which says in one column what the two said together.
--
-- THIS CHANGES SIGNED CONTENT. `category` and `productCategoryId` are both in
-- an FAQ's signed payload (src/security/schemas.js), so every FAQ's stored
-- signature stops matching the moment this runs. The migration that executes
-- this file (20260922110000_the_faq_is_filed_by_product.js) checks each
-- signature against the payload as it was BEFORE, and re-signs only the rows
-- that verified - a row that had been changed behind the console keeps its
-- failing signature and is left for `npm run sign:audit` to report, exactly as
-- it would have been without this delta.
--
-- sql/schema.sql is the source of truth; this is safe to run twice, and on a
-- database the current schema.sql built.


-- ---------------------------------------------------------------------
-- 1. THE VOCABULARY
-- ---------------------------------------------------------------------

DO $$
BEGIN
    CREATE TYPE faq_category AS ENUM (
        'SMARTPHONE', 'TV', 'STB', 'COMPUTER', 'CAMERA', 'CRYSTAL_APP', 'ESHOP', 'APPSTORE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE faq_category IS
  'what a published answer is about: the catalogue''s product kinds, then the three Crystal
   services that are not products. Declared in reading order - the order of the FAQ page''s
   filter chips.';


-- ---------------------------------------------------------------------
-- 2. EVERY ANSWER, REFILED
--
-- Only while the column is not yet faq_category - a second run, or a database
-- built from the current schema.sql, finds nothing to do.
--
-- The column goes through text so the rows can be rewritten in words that
-- neither enum holds both of. v_faq_signatures reads the column, and a view
-- blocks ALTER COLUMN TYPE, so it comes down first and goes back afterwards -
-- from pg_get_viewdef, as delta 011 does, so there is no second copy of its
-- definition here to drift from schema.sql. Its comment is carried over too;
-- dropping a view drops its comment with it.
-- ---------------------------------------------------------------------

DO $$
DECLARE
    view_sql     text;
    view_comment text;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'faqs'
           AND column_name = 'category'
           AND udt_name = 'faq_category'
    ) THEN
        RETURN;
    END IF;

    IF to_regclass('v_faq_signatures') IS NOT NULL THEN
        view_sql := pg_get_viewdef(to_regclass('v_faq_signatures'), true);
        view_comment := obj_description(to_regclass('v_faq_signatures'), 'pg_class');
        EXECUTE 'DROP VIEW v_faq_signatures';
    END IF;

    ALTER TABLE faqs DROP CONSTRAINT IF EXISTS chk_faqs_category;
    ALTER TABLE faqs ALTER COLUMN category TYPE varchar(20) USING category::text;

    /*
     * AN EPRODUCT ANSWER TAKES THE KIND OF THE SECTION IT WAS PINNED TO.
     *
     * That column is exactly what said which eproduct a question was about, so
     * where it is set it decides. Only while it still exists - it is dropped
     * below, and a replay must not name it.
     */
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'faqs'
           AND column_name = 'product_category_id'
    ) THEN
        EXECUTE $pin$
            UPDATE faqs f
               SET category = c.type::text
              FROM product_categories c
             WHERE f.category = 'EPRODUCT'
               AND c.id = f.product_category_id
               AND c.type::text IN ('TV', 'STB', 'COMPUTER', 'CAMERA')
        $pin$;
    END IF;

    /*
     * ONE WITH NO SECTION IS READ FOR THE PRODUCT IT NAMES - in this order, so
     * "televisions and set-top boxes" is a television question, which is the
     * larger of the two lines.
     */
    UPDATE faqs SET category = 'TV'
     WHERE category = 'EPRODUCT' AND question ~* '(televisions?|\mtvs?\M)';
    UPDATE faqs SET category = 'STB'
     WHERE category = 'EPRODUCT' AND question ~* '(set-top|settop|\mstbs?\M|receivers?|media player)';
    UPDATE faqs SET category = 'COMPUTER'
     WHERE category = 'EPRODUCT' AND question ~* '(computers?|laptops?|desktops?|notebooks?|\mpcs?\M)';
    UPDATE faqs SET category = 'CAMERA'
     WHERE category = 'EPRODUCT' AND question ~* '(cameras?|cctv|surveillance|lens(es)?)';

    /*
     * AND ONE THAT NAMES NONE OF THEM IS A TELEVISION QUESTION - the largest
     * eproduct line, and the safe default to be wrong in. Nothing is lost by
     * guessing: the question is still published, the console lists it under
     * TV, and moving it is one select.
     */
    UPDATE faqs SET category = 'TV' WHERE category = 'EPRODUCT';

    ALTER TABLE faqs ALTER COLUMN category TYPE faq_category USING category::faq_category;

    IF view_sql IS NOT NULL THEN
        EXECUTE 'CREATE VIEW v_faq_signatures AS ' || view_sql;
        IF view_comment IS NOT NULL THEN
            EXECUTE format('COMMENT ON VIEW v_faq_signatures IS %L', view_comment);
        END IF;
    END IF;
END $$;

COMMENT ON COLUMN faqs.category IS
  'WHAT the question is about: the product kind the visitor is holding (the catalogue''s
   product_kind, value for value), or the Crystal App, the Eshop or the Appstore.
   Inside the signed payload - a change to the vocabulary is a change to what an FAQ
   signature can say (src/security/schemas.js).';


-- ---------------------------------------------------------------------
-- 3. THE SECTION, AND THE OLD TYPE, GO
--
-- The catalogue section said "which eproduct"; the category says it now. The
-- storefront's section pages ask for their FAQs by product kind instead
-- (services/storefront.service.js), which is the same answer without the
-- second column.
--
-- crystal_system had one user, and this was it. The feedback desk routes by
-- enquiry_source, which is its own type and is not touched.
-- ---------------------------------------------------------------------

ALTER TABLE faqs DROP COLUMN IF EXISTS product_category_id;

DROP TYPE IF EXISTS crystal_system;
