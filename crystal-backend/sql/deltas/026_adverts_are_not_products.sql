-- 026  The homepage and the smartphone page get advertising of their own
--
-- The homepage hero showed the photographs of whichever smartphone was
-- flagged as the section's hero, and the smartphone page's hero was a run of
-- media_assets rows owned by the SMARTPHONE category.  Neither was right: the
-- top of those two pages is ADVERTISING, a picture with its copy burnt in that
-- belongs to no product and no category.
--
-- So an advert has a PLACEMENT - HOME or SMARTPHONE - and each placement is a
-- console page of its own under the catalogue:
--
--   /admin/catalog/adverts/home         Homepage adverts
--   /admin/catalog/adverts/smartphone   Smartphone adverts
--
-- The smartphone category's existing HERO run is MOVED here rather than
-- copied, so the storefront shows exactly what it showed before and the media
-- library stops listing pictures it no longer governs.  The eproduct sections
-- keep their category HERO runs; nothing about them changes.
--
-- Nothing is invented for the homepage: a production site's adverts are
-- uploaded through the console, and until they are the homepage says so.
--
-- Idempotent: the type, table, pages and grants are created only when absent,
-- and the move finds nothing the second time.

DO $$
BEGIN
  CREATE TYPE advert_placement AS ENUM ('HOME', 'SMARTPHONE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS site_adverts (
    id           serial           PRIMARY KEY,
    placement    advert_placement NOT NULL,
    device_type  device_target    NOT NULL DEFAULT 'all',
    file_path    varchar(255)     NOT NULL,
    alt_text     varchar(255)     NULL,
    link_url     varchar(255)     NULL,
    sort_order   integer          NOT NULL DEFAULT 0,
    status       record_status    NOT NULL DEFAULT 'ACTIVE',
    is_deleted   boolean          NOT NULL DEFAULT false,
    created_at   timestamptz      NOT NULL DEFAULT now(),
    updated_at   timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_adverts_placement ON site_adverts(placement, device_type, sort_order);

DROP TRIGGER IF EXISTS trg_site_adverts_updated ON site_adverts;
CREATE TRIGGER trg_site_adverts_updated
    BEFORE UPDATE ON site_adverts
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- The smartphone page's run, moved in the order it was shown.
WITH moved AS (
  DELETE FROM media_assets m
   USING product_categories c
   WHERE m.owner_type = 'CATEGORY'
     AND m.owner_id = c.id
     AND c.type = 'SMARTPHONE'
     AND m.purpose = 'HERO'
  RETURNING m.device_type, m.file_path, m.alt_text, m.link_url, m.sort_order, m.created_at
)
INSERT INTO site_adverts (placement, device_type, file_path, alt_text, link_url, sort_order, created_at)
SELECT 'SMARTPHONE', device_type, file_path, alt_text, link_url, sort_order, created_at
  FROM moved;

-- The two pages, after the media library.
INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT '/admin/catalog/adverts/home', 'Homepage adverts', 'MdViewCarousel',
       COALESCE((SELECT sort_order + 1 FROM manager_pages WHERE page_url = '/admin/catalog/media'), 90),
       true,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/catalog')
WHERE NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/catalog/adverts/home');

INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT '/admin/catalog/adverts/smartphone', 'Smartphone adverts', 'MdSlideshow',
       COALESCE((SELECT sort_order + 2 FROM manager_pages WHERE page_url = '/admin/catalog/media'), 91),
       true,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/catalog')
WHERE NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/catalog/adverts/smartphone');

-- Each page inherits the catalogue's grant, the rule delta 023 set for a new
-- page: whoever runs the catalogue - and so already ran the smartphone hero
-- from the categories screen - runs these.
INSERT INTO manager_permissions (role_id, page_id, permission)
SELECT parent.role_id, page.id, parent.permission
  FROM manager_permissions AS parent
  JOIN manager_pages AS page
    ON page.page_url IN ('/admin/catalog/adverts/home', '/admin/catalog/adverts/smartphone')
 WHERE parent.page_id = (SELECT id FROM manager_pages WHERE page_url = '/admin/catalog')
   AND parent.permission > 0
   AND NOT EXISTS (
         SELECT 1
           FROM manager_permissions existing
          WHERE existing.role_id = parent.role_id
            AND existing.page_id = page.id
       );
