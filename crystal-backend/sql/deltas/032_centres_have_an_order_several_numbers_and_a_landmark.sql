-- 032  Service centres get a display order, several phone numbers and a
--      landmark - and the provinces get an order somebody chose
--
--   1. provinces       a master table: the vocabulary `agencies.province` is
--                      checked against, and the ORDER the storefront's
--                      province filter lists them in
--   2. agencies        + sort_order (the display order, NULL = not placed)
--                      + landmark   (console only)
--   3. agency_phones   every number a centre answers, labelled and ordered;
--                      agencies.phone is moved into it and dropped
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and every statement is safe to
-- run twice - or on a database the current schema.sql built, which is what
-- `npm run migrate:verify` replays it against.


-- =====================================================================
-- 1. THE PROVINCES, IN AN ORDER SOMEBODY CHOSE
--
-- The locator's province dropdown was `GROUP BY province ORDER BY province`:
-- the alphabet, which is nobody's decision. Anhui led a list whose busiest
-- counters are in Guangdong and Shanghai, and there was no way to say
-- otherwise short of renaming a province.
--
-- The order is data now, on a console screen (/admin/support/provinces), and
-- the table is the vocabulary as well: agencies.province refers to it by NAME,
-- so a centre typed into "Guangdong " is refused rather than filed under a
-- province the filter will never offer. ON UPDATE CASCADE makes a rename here
-- a rename on every centre in the province.
-- =====================================================================

CREATE TABLE IF NOT EXISTS provinces (
    id         serial       PRIMARY KEY,
    name       varchar(80)  NOT NULL UNIQUE,
    sort_order integer      NOT NULL DEFAULT 0,
    is_deleted boolean      NOT NULL DEFAULT false,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE provinces IS
  'the provinces a service centre can be in, and the ORDER the locator lists them in -
   lower sort_order first. Edited at /admin/support/provinces.';
COMMENT ON COLUMN provinces.sort_order IS
  'the position in the storefront''s province filter, lower first; ties by name';

CREATE INDEX IF NOT EXISTS idx_provinces_order ON provinces(sort_order, name);

DO $$
BEGIN
    CREATE TRIGGER trg_provinces_updated
        BEFORE UPDATE ON provinces
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

/*
 * EVERY PROVINCE A CENTRE IS ALREADY IN, BUSIEST FIRST.
 *
 * The first order has to come from somewhere, and the alphabet is the one it
 * is replacing. The number of live centres is the closest thing an existing
 * database has to "where our customers are": the province most visitors pick
 * is the one with the most counters in it. Steps of ten, so a province can be
 * slotted between two others without renumbering the rest.
 *
 * A province already in the table is left exactly as it is - a second run
 * must not undo an order somebody set in the console.
 */
INSERT INTO provinces (name, sort_order)
SELECT a.province,
       (ROW_NUMBER() OVER (
            ORDER BY COUNT(*) FILTER (WHERE a.is_deleted = false AND a.status = 'ACTIVE') DESC,
                     a.province
        )) * 10
  FROM agencies a
 GROUP BY a.province
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
    ALTER TABLE agencies
        ADD CONSTRAINT fk_agencies_province
        FOREIGN KEY (province) REFERENCES provinces(name) ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =====================================================================
-- 2. A DISPLAY ORDER, AND A LANDMARK
--
-- sort_order is NULLABLE, unlike every other sort_order in this schema, and
-- that is the point of it: NULL is "not placed". An unplaced centre follows
-- every placed one, in the order the list always had - province, tier, name -
-- so an existing network keeps its order until somebody moves a centre, and a
-- new centre does not land at the top of the list because 0 sorts first.
--
-- landmark is the well-known building nearby, for staff. It is never selected
-- by a storefront read; scripts/check.js proves it is absent from every public
-- reply that carries a centre.
-- =====================================================================

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS landmark   varchar(200) NULL;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS sort_order integer      NULL;

COMMENT ON COLUMN agencies.landmark IS
  'the well-known building nearby, so staff can find the address. CONSOLE ONLY - never
   sent by the storefront API, which selects its columns by name';
COMMENT ON COLUMN agencies.sort_order IS
  'display order, lower first, in the console and on the storefront. NULL = not placed:
   after every placed centre, in province, tier and name order';

CREATE INDEX IF NOT EXISTS idx_agencies_order ON agencies(sort_order, name);


-- =====================================================================
-- 3. SEVERAL NUMBERS
--
-- A child table, the way agency_services is one: each number has a label and
-- a place in the list, and the console searches centres by number.
-- =====================================================================

CREATE TABLE IF NOT EXISTS agency_phones (
    id         serial       PRIMARY KEY,
    agency_id  integer      NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    phone      varchar(40)  NOT NULL,
    label      varchar(60)  NULL,
    sort_order integer      NOT NULL DEFAULT 0,
    CONSTRAINT uq_agency_phone UNIQUE (agency_id, phone)
);

COMMENT ON TABLE agency_phones IS
  'every number a service centre answers, in the order it lists them. Replaced as a whole
   list on save - see agencies.repository.js replacePhones - so the order on screen is the
   order stored.';

CREATE INDEX IF NOT EXISTS idx_agency_phones_agency ON agency_phones(agency_id, sort_order);

/*
 * THE OLD COLUMN IS MOVED ACROSS, THEN DROPPED - only while it still exists,
 * which is what makes the block replayable (a database built from the current
 * schema.sql never had it).
 *
 * One column held "several numbers" the only way it could: typed into the
 * same box. A comma, a semicolon, or a slash WITH SPACES AROUND IT separates
 * two numbers and each becomes its own row, in the order it was written. A
 * bare slash does not - "021/6234 5678" is one number with its area code, and
 * splitting it would publish two halves of it. A number written twice is
 * kept once.
 */
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'agencies'
           AND column_name = 'phone'
    ) THEN
        EXECUTE $move$
            INSERT INTO agency_phones (agency_id, phone, sort_order)
            SELECT a.id, trim(part.value), part.n * 10
              FROM agencies a
             CROSS JOIN LATERAL regexp_split_to_table(a.phone, '\s*[,;]\s*|\s+/\s+')
                   WITH ORDINALITY AS part(value, n)
             WHERE a.phone IS NOT NULL
               AND trim(part.value) <> ''
            ON CONFLICT (agency_id, phone) DO NOTHING
        $move$;

        ALTER TABLE agencies DROP COLUMN phone;
    END IF;
END $$;
