-- ---------------------------------------------------------------------
-- Delta 014 - the About page becomes content rather than code.
--
-- The company introduction was a React file: six timeline entries, four
-- values and two paragraphs of copy, typed into `crystal-web/src/pages`.
-- Every one of those is a sentence somebody in the company owns, and none of
-- them was editable without a release.
--
-- Ten chapters now, all of them edited in the console. THREE TABLES, not
-- fifteen - the split is by shape rather than by chapter, so an eleventh
-- chapter costs a row rather than a table, a route and a screen:
--
--   about_sections      the chapter itself - eyebrow, heading, copy, artwork
--   about_items         every LIST inside a chapter, tagged with its kind
--   about_certificates  a genuinely different shape, and used by two chapters
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

DO $$
DECLARE
    spec record;
BEGIN
    FOR spec IN
        SELECT * FROM (VALUES
            ('about_section', ARRAY['OVERVIEW','VISION','BUSINESSES','RECOGNITION','HISTORY',
                                    'INSTITUTE','FACTORY','MANUFACTURING','SHOP','SERVICE','PRESENCE']),
            ('about_item_kind', ARRAY['FACT','BUSINESS','HISTORY_EVENT','RESEARCH_AREA',
                                      'FACTORY_CAPABILITY','MANUFACTURING_CAPABILITY',
                                      'MANUFACTURING_STAGE','SHOP_FLOOR','SERVICE','LOCATION']),
            ('certificate_kind', ARRAY['TOP10','CORPORATE','FACTORY_QA'])
        ) AS v(name, values)
    LOOP
        BEGIN
            EXECUTE format(
                'CREATE TYPE %I AS ENUM (%s)',
                spec.name,
                (SELECT string_agg(quote_literal(x), ', ') FROM unnest(spec.values) AS x)
            );
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    END LOOP;
END $$;


CREATE TABLE IF NOT EXISTS about_sections (
    id                  serial        PRIMARY KEY,
    code                about_section NOT NULL UNIQUE,
    eyebrow             varchar(80)   NULL,
    title               varchar(200)  NOT NULL,
    subtitle            varchar(300)  NULL,
    description         text          NULL,
    image_desktop       varchar(255)  NULL,
    image_mobile        varchar(255)  NULL,
    image_desktop_dark  varchar(255)  NULL,
    image_mobile_dark   varchar(255)  NULL,
    cta_label           varchar(80)   NULL,
    cta_route           varchar(255)  NULL,
    sort_order          integer       NOT NULL DEFAULT 0,
    status              record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted          boolean       NOT NULL DEFAULT false,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE about_sections IS
  'one row per chapter of the About page - the heading, the copy and the
   artwork that introduce it. The lists inside a chapter are about_items.';
COMMENT ON COLUMN about_sections.code IS
  'the chapter, and the anchor the storefront scrolls to: /about#overview';


CREATE TABLE IF NOT EXISTS about_items (
    id             serial          PRIMARY KEY,
    kind           about_item_kind NOT NULL,
    title          varchar(200)    NOT NULL,
    subtitle       varchar(200)    NULL,
    description    text            NULL,
    value          varchar(60)     NULL,
    year           smallint        NULL CHECK (year IS NULL OR year BETWEEN 1900 AND 2200),
    floor_number   smallint        NULL,
    icon           varchar(60)     NULL,
    link_url       varchar(255)    NULL,
    image_desktop  varchar(255)    NULL,
    image_mobile   varchar(255)    NULL,
    is_featured    boolean         NOT NULL DEFAULT false,
    sort_order     integer         NOT NULL DEFAULT 0,
    status         record_status   NOT NULL DEFAULT 'ACTIVE',
    is_deleted     boolean         NOT NULL DEFAULT false,
    created_at     timestamptz     NOT NULL DEFAULT now(),
    updated_at     timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT chk_about_floor CHECK (kind <> 'SHOP_FLOOR' OR floor_number IS NOT NULL),
    CONSTRAINT chk_about_year  CHECK (kind <> 'HISTORY_EVENT' OR year IS NOT NULL)
);

COMMENT ON TABLE about_items IS
  'every LIST on the About page, with the chapter it belongs to on the row.
   One table rather than nine near-copies of a title, a description, two
   images, an order and a switch.';

CREATE INDEX IF NOT EXISTS idx_about_items_kind ON about_items(kind, sort_order);


CREATE TABLE IF NOT EXISTS about_certificates (
    id           serial           PRIMARY KEY,
    kind         certificate_kind NOT NULL,
    name         varchar(200)     NOT NULL,
    issuer       varchar(160)     NULL,
    issue_date   date             NULL,
    year         smallint         NULL CHECK (year IS NULL OR year BETWEEN 1900 AND 2200),
    description  text             NULL,
    image        varchar(255)     NULL,
    is_featured  boolean          NOT NULL DEFAULT false,
    sort_order   integer          NOT NULL DEFAULT 0,
    status       record_status    NOT NULL DEFAULT 'ACTIVE',
    is_deleted   boolean          NOT NULL DEFAULT false,
    created_at   timestamptz      NOT NULL DEFAULT now(),
    updated_at   timestamptz      NOT NULL DEFAULT now()
);

COMMENT ON TABLE about_certificates IS
  'the recognition and the quality marks. Its own table because it is the one
   About list with a real shape of its own - an issuer, a date and a scan the
   reader opens - and because two chapters draw from it.';

CREATE INDEX IF NOT EXISTS idx_about_certificates_kind ON about_certificates(kind, sort_order);


DO $$
BEGIN
    CREATE TRIGGER trg_about_sections_updated
        BEFORE UPDATE ON about_sections
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TRIGGER trg_about_items_updated
        BEFORE UPDATE ON about_items
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TRIGGER trg_about_certificates_updated
        BEFORE UPDATE ON about_certificates
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ---------------------------------------------------------------------
-- THE CONSOLE SCREENS THE CHAPTERS ARE EDITED ON.
--
-- A route whose admin_pages row is missing is refused with a 500 that says
-- so, so registering them is part of shipping the tables. They sit under a
-- new `Company` parent rather than under Base: the About page is the one
-- screen in the console that is about the company rather than about the
-- catalogue, the estate or the members.
--
-- Every grant is by prefix, so a role granted /admin/company gets all ten.
-- ---------------------------------------------------------------------

/* The parent first: the children below hang off its id. */
INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT '/admin/company', 'Company', 'MdBusiness', 900, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/company');

/*
 * And the page the three API routes are guarded ON, which is not in the menu.
 * A route whose admin_pages row is missing is refused with a 500 that says so,
 * so this row is what makes the ten screens able to read anything at all.
 */
INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT '/admin/company/about', 'About page', 'MdChromeReaderMode', 905, false,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/company')
WHERE NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/company/about');

INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT v.url, v.name, v.icon, v.ord, true,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/company')
  FROM (VALUES
    ('/admin/company/about/overview',      'Overview',        'MdInfoOutline',   910),
    ('/admin/company/about/businesses',    'Vision & Businesses', 'MdWidgets',  920),
    ('/admin/company/about/recognition',   'Recognition',     'MdStars',   930),
    ('/admin/company/about/history',       'History',         'MdTimeline',      940),
    ('/admin/company/about/institute',     'IT Institute',    'MdDeveloperBoard',       950),
    ('/admin/company/about/factory',       'Factory',         'MdDomain',       960),
    ('/admin/company/about/manufacturing', 'Manufacturing',   'MdSettingsApplications', 970),
    ('/admin/company/about/shop',          'Crystal Shop',    'MdStoreMallDirectory', 980),
    ('/admin/company/about/service',       'After-Service',   'MdRoomService',  990),
    ('/admin/company/about/presence',      'Presence',        'MdPublic',        1000)
  ) AS v(url, name, icon, ord)
 WHERE EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/company')
   AND NOT EXISTS (SELECT 1 FROM manager_pages p WHERE p.page_url = v.url);
