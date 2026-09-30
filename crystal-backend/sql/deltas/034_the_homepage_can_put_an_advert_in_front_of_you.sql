-- 034  Popup adverts on the homepage, and a period to run them in
--
-- The homepage's hero advertises to somebody already looking at it.  A
-- campaign that has to be SEEN - a sale that opens on Friday, a recall notice,
-- a launch - needs the page to say so before the visitor starts reading, which
-- is what a popup is for.
--
-- IT IS A TABLE OF ITS OWN, not a third `advert_placement`.  A hero advert is
-- one of a run that shares a strip and a clock; a popup has a PERIOD it runs
-- in, is shown once a session rather than on a loop, and is dismissed rather
-- than scrolled past.  Sharing site_adverts would mean two date columns that
-- are null for every hero row and a placement that behaves unlike the other
-- two everywhere it is read.
--
--   /admin/catalog/adverts/popup        Popup adverts
--
-- THE PERIOD IS DAYS, NOT INSTANTS - `date`, and inclusive at both ends, so a
-- campaign entered as the 1st to the 7th runs for seven whole days wherever
-- the reader is.  This is the vendor's rule (vendor_backend home_popups, read
-- with TO_CHAR(start_date,'YYYY-MM-DD') <= today <= TO_CHAR(end_date,...)),
-- kept because a marketing period that ends at midnight in one timezone and
-- 4pm in another is a support call, not a feature.
--
-- Nothing is seeded.  A homepage with no live popup shows no popup, which is
-- the state a site should be in most of the time.
--
-- Idempotent: the table, its index, the page and the grants are each created
-- only when absent.

CREATE TABLE IF NOT EXISTS site_popups (
    id           serial        PRIMARY KEY,
    file_path    varchar(255)  NOT NULL,
    alt_text     varchar(255)  NULL,
    link_url     varchar(255)  NULL,
    start_date   date          NOT NULL,
    end_date     date          NOT NULL,
    sort_order   integer       NOT NULL DEFAULT 0,
    status       record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted   boolean       NOT NULL DEFAULT false,
    created_at   timestamptz   NOT NULL DEFAULT now(),
    updated_at   timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT chk_site_popups_period CHECK (end_date >= start_date)
);

COMMENT ON TABLE site_popups IS
  'Full-screen adverts shown over the homepage, once per browser session, while today is inside the period';
COMMENT ON COLUMN site_popups.start_date IS 'first day the popup runs, inclusive';
COMMENT ON COLUMN site_popups.end_date IS 'last day the popup runs, inclusive';
COMMENT ON COLUMN site_popups.sort_order IS 'the order they are clicked through, lowest first';

-- The storefront asks one question of this table - what is live today - and
-- asks it on every homepage view.
CREATE INDEX IF NOT EXISTS idx_site_popups_live
    ON site_popups(status, is_deleted, start_date, end_date, sort_order);

DROP TRIGGER IF EXISTS trg_site_popups_updated ON site_popups;
CREATE TRIGGER trg_site_popups_updated
    BEFORE UPDATE ON site_popups
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- The page, beside the two advert runs it belongs with.
INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT '/admin/catalog/adverts/popup', 'Popup adverts', 'MdAnnouncement',
       COALESCE((SELECT sort_order + 1 FROM manager_pages WHERE page_url = '/admin/catalog/adverts/smartphone'), 92),
       true,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/catalog')
WHERE NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/catalog/adverts/popup');

-- And it inherits the catalogue's grant, as delta 023 says a new page does.
INSERT INTO manager_permissions (role_id, page_id, permission)
SELECT parent.role_id, page.id, parent.permission
  FROM manager_permissions AS parent
  JOIN manager_pages AS page
    ON page.page_url = '/admin/catalog/adverts/popup'
 WHERE parent.page_id = (SELECT id FROM manager_pages WHERE page_url = '/admin/catalog')
   AND parent.permission > 0
   AND NOT EXISTS (
         SELECT 1
           FROM manager_permissions existing
          WHERE existing.role_id = parent.role_id
            AND existing.page_id = page.id
       );
