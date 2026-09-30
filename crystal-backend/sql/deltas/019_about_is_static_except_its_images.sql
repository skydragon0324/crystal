-- ---------------------------------------------------------------------
-- Delta 019 - the About page is written in code; only its pictures are data.
--
-- Three tables and two enum types managed the About page as a CMS:
-- about_sections held ten chapters of copy, about_items held sixty-two
-- bullets, milestones and figures, and about_certificates held fourteen
-- awards. Ten console screens edited them.
--
-- That was the wrong shape for what this page is. A company introduction is
-- not content that turns over - it is the company's own description of itself,
-- rewritten every few years by somebody who cares about the wording. Editing
-- it through a form meant the copy lived in a database where it could not be
-- reviewed, could not be diffed, and could not be translated alongside the
-- rest of the site's words. Ten screens existed to change text that nobody
-- changes.
--
-- THE PICTURES ARE THE EXCEPTION, and they are the whole reason a table
-- survives here. A photograph of the factory floor is uploaded, replaced when
-- the floor is repainted, and has to be served from somewhere - it cannot live
-- in a source file. So one table remains, and it holds nothing but images.
--
--   about_images(slot, file_path, ...)
--
-- `slot` is the name the page asks for a picture by - 'hero', 'factory.floor',
-- 'certificate' - and a slot may hold one image or many. The COPY that goes
-- with a picture stays in code, except for the two things that belong to the
-- file itself: its alt text and, for a gallery, its caption.
--
-- What this deletes cannot be recovered from Crystal, and that is deliberate:
-- the copy has moved into crystal-web/src/pages/about/content.js, where it is
-- now under review like every other line in the project.
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. THE ONE TABLE THAT SURVIVES
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS about_images (
    id          serial       PRIMARY KEY,

    /*
     * WHERE ON THE PAGE THIS PICTURE GOES.
     *
     * A plain varchar rather than an enum, and that is a change of mind from
     * the enum the sections used. A slot is not a vocabulary the database has
     * an opinion about - the PAGE decides what it asks for, and adding a band
     * to a static page should not need a migration to give it a photograph.
     * An unknown slot is simply a picture nothing renders, which is visible in
     * the console and harmless.
     */
    slot        varchar(60)  NOT NULL,

    file_path   varchar(255) NOT NULL,

    /*
     * The dark variant, optional, falling back to the light one.
     *
     * A photograph must never be inverted to fit a colour mode; a diagram or a
     * map often has a dark rendering, and when there is one it should be used.
     * Mobile is NOT a second column any more - the page uses one image per
     * slot and lets CSS crop it, which is what it was already doing for every
     * slot but the hero.
     */
    file_path_dark varchar(255) NULL,

    /* The two strings that belong to the FILE rather than to the page. */
    alt_text    varchar(255) NULL,
    caption     varchar(200) NULL,

    sort_order  integer      NOT NULL DEFAULT 0,
    status      record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted  boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE about_images IS
  'the only part of the About page that is data. Its copy is in
   crystal-web/src/pages/about/content.js, because a company description is
   rewritten every few years by somebody who cares about the wording - not
   edited through a form.';
COMMENT ON COLUMN about_images.slot IS
  'the name the page asks for a picture by. A slot may hold one image or many:
   ''hero'' is one, ''certificate'' is fourteen.';
COMMENT ON COLUMN about_images.caption IS
  'shown under a gallery image. NULL for a slot the page captions itself.';

CREATE INDEX IF NOT EXISTS idx_about_images_slot ON about_images(slot, sort_order);

DO $$
BEGIN
    CREATE TRIGGER trg_about_images_updated
        BEFORE UPDATE ON about_images
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ---------------------------------------------------------------------
-- 2. CARRY THE PICTURES ACROSS before the tables go
--
-- Only the file paths, because only the file paths are being kept. Guarded by
-- NOT EXISTS on the target so a second run moves nothing, and by a check that
-- the source table is still there so a fresh install - where it never was -
-- skips the whole block.
-- ---------------------------------------------------------------------

DO $$
BEGIN
    IF to_regclass('about_sections') IS NULL THEN RETURN; END IF;

    INSERT INTO about_images (slot, file_path, file_path_dark, alt_text, sort_order)
    SELECT lower(s.code::text), s.image_desktop, s.image_desktop_dark, s.title, 0
      FROM about_sections s
     WHERE s.image_desktop IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM about_images i WHERE i.file_path = s.image_desktop
       );
END $$;

DO $$
BEGIN
    IF to_regclass('about_certificates') IS NULL THEN RETURN; END IF;

    INSERT INTO about_images (slot, file_path, alt_text, caption, sort_order)
    SELECT 'certificate', c.image, c.name, c.name, c.sort_order
      FROM about_certificates c
     WHERE c.image IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM about_images i WHERE i.file_path = c.image
       );
END $$;


-- ---------------------------------------------------------------------
-- 3. AND THE CMS GOES
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS about_items CASCADE;
DROP TABLE IF EXISTS about_certificates CASCADE;
DROP TABLE IF EXISTS about_sections CASCADE;

/*
 * The two enum types with them. They named a chapter and a kind of bullet -
 * vocabularies that only made sense while the copy was data, and that a static
 * page has no use for. Dropped only if nothing else adopted them.
 */
DROP TYPE IF EXISTS about_item_kind;
DROP TYPE IF EXISTS about_section;


-- ---------------------------------------------------------------------
-- 4. TEN CONSOLE SCREENS BECOME ONE
--
-- A route whose admin_pages row is missing is refused with a 500 that says so
-- (middleware/permission.js), so the new page is registered here rather than
-- left to a seed - and the ten that edited copy are removed, because a menu
-- entry pointing at a screen that no longer exists is worse than no entry.
-- ---------------------------------------------------------------------

INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT '/admin/company/about-images', 'About images', 'MdPhotoLibrary',
       COALESCE((SELECT sort_order FROM manager_pages WHERE page_url = '/admin/company/about'), 10),
       true,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/company')
WHERE NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/company/about-images');

DELETE FROM manager_permissions
 WHERE page_id IN (SELECT id FROM manager_pages WHERE page_url LIKE '/admin/company/about/%'
                      OR page_url = '/admin/company/about');

DELETE FROM manager_pages
 WHERE page_url LIKE '/admin/company/about/%'
    OR page_url = '/admin/company/about';
