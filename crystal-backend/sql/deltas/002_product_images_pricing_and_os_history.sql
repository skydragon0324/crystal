-- ---------------------------------------------------------------------
-- Delta 002 - three tables reshaped.
--
--   1. product_images   a product's own artwork comes out of media_assets
--   2. service_prices   cut back to the published price list and nothing else
--   3. product_os_history  a product's own update record, no longer a rollout
--                          of a Crystal OS release
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file is what brings an EXISTING database up to it, so the two must be kept
-- saying the same thing. Every statement is safe to run twice - a delta that
-- only works on a database that has never seen it is a delta nobody dares run.
-- ---------------------------------------------------------------------


-- =====================================================================
-- 1. product_images
--
-- The two runs every product has, out of the polymorphic table and into a
-- real relation. media_assets keeps what is genuinely polymorphic: section
-- and series banners, article figures, OS release screens, and a product's
-- HERO and THUMBNAIL slots.
-- =====================================================================

CREATE TABLE IF NOT EXISTS product_images (
    id          serial       PRIMARY KEY,
    product_id  integer      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    kind        varchar(12)  NOT NULL CHECK (kind IN ('MAIN','ADVERT')),
    device_type varchar(12)  NOT NULL DEFAULT 'all'
                             CHECK (device_type IN ('desktop','mobile','all')),
    file_path   varchar(255) NOT NULL,
    alt_text    varchar(255) NULL,
    width       integer      NULL,
    height      integer      NULL,
    sort_order  integer      NOT NULL DEFAULT 0,
    is_deleted  boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images
    ON product_images(product_id, kind, sort_order);

DO $$
BEGIN
    CREATE TRIGGER trg_product_images_updated
        BEFORE UPDATE ON product_images
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

/*
 * Carry the existing artwork across.
 *
 * GALLERY was the studio set and becomes MAIN; DETAIL was the advertising run
 * and becomes ADVERT. Guarded by NOT EXISTS so a second run moves nothing: the
 * media_assets rows are deleted below, but a delta has to be safe even if it
 * is interrupted between the two statements.
 */
/*
 * THE TWO COLUMNS ARE CAST TO WHATEVER THEY ARE TODAY, and that is not
 * over-engineering - it is what makes this file replayable.
 *
 * `knex migrate:latest` on an EMPTY database runs the init migration first,
 * and the init migration executes the CURRENT sql/schema.sql - so by the time
 * this delta runs on a new machine, `kind` and `device_type` are already the
 * enum types delta 011 introduced years of deltas later. A CASE returns text,
 * and Postgres will not put text into an enum column, so the statement below
 * failed to PARSE - not to find rows, to parse - and a fresh install could not
 * be migrated at all. On an existing database, where this delta ran back when
 * both columns were varchar, the same statement was fine.
 *
 * So the cast is looked up rather than written. `format_type` answers what the
 * column is on THIS database, which is varchar on the old path and an enum on
 * the new one, and the insert is correct on both.
 */
DO $$
DECLARE
    kind_type   text;
    device_type text;
BEGIN
    SELECT format_type(atttypid, atttypmod) INTO kind_type
      FROM pg_attribute
     WHERE attrelid = 'product_images'::regclass AND attname = 'kind';

    SELECT format_type(atttypid, atttypmod) INTO device_type
      FROM pg_attribute
     WHERE attrelid = 'product_images'::regclass AND attname = 'device_type';

    EXECUTE format(
        'INSERT INTO product_images
             (product_id, kind, device_type, file_path, alt_text, width, height, sort_order, created_at)
         SELECT m.owner_id,
                (CASE m.purpose WHEN ''GALLERY'' THEN ''MAIN'' ELSE ''ADVERT'' END)::%s,
                m.device_type::text::%s,
                m.file_path, m.alt_text, m.width, m.height, m.sort_order, m.created_at
           FROM media_assets m
           JOIN products p ON p.id = m.owner_id
          WHERE m.owner_type::text = ''PRODUCT''
            AND m.purpose IN (''GALLERY'', ''DETAIL'')
            AND NOT EXISTS (
                 SELECT 1 FROM product_images i
                  WHERE i.product_id = m.owner_id
                    AND i.file_path = m.file_path
            )',
        kind_type, device_type
    );
END $$;

DELETE FROM media_assets
 WHERE owner_type = 'PRODUCT'
   AND purpose IN ('GALLERY', 'DETAIL');


-- =====================================================================
-- 2. service_prices
--
-- The published price list, and only that. The ticket side of a repair - the
-- stock item a line consumed, its bench minutes, how many were covered, the
-- internal costing price - belongs to the REPAIR, and repair_ticket_items
-- already keeps its own copy of every figure it charged. So an old ticket
-- still shows the price it quoted after this runs.
-- =====================================================================

-- `name` becomes `part_name`: it names a part, as published.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'service_prices' AND column_name = 'name')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'service_prices' AND column_name = 'part_name')
    THEN
        ALTER TABLE service_prices RENAME COLUMN name TO part_name;
    END IF;
END $$;

ALTER TABLE service_prices ADD COLUMN IF NOT EXISTS part_name varchar(160);
UPDATE service_prices SET part_name = 'Unnamed part' WHERE part_name IS NULL;
ALTER TABLE service_prices ALTER COLUMN part_name SET NOT NULL;

/*
 * The counter price wins where the two disagree.
 *
 * `sale_price` was what the storefront published and `part_price` what the
 * repair was costed at internally. Only one column survives and it is the
 * published one, so the figure a customer has already been quoted on the
 * website is the figure that is kept.
 */
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'service_prices' AND column_name = 'sale_price')
    THEN
        UPDATE service_prices SET part_price = sale_price WHERE sale_price > 0;
    END IF;
END $$;

-- The ticket may point at a price line; that link is unaffected. It is the
-- line's own link to a SHELF that goes.
ALTER TABLE service_prices DROP CONSTRAINT IF EXISTS fk_service_prices_part;

ALTER TABLE service_prices DROP COLUMN IF EXISTS part_id;
ALTER TABLE service_prices DROP COLUMN IF EXISTS sale_price;
ALTER TABLE service_prices DROP COLUMN IF EXISTS limit_quantity;
ALTER TABLE service_prices DROP COLUMN IF EXISTS labour_minutes;
ALTER TABLE service_prices DROP COLUMN IF EXISTS currency;

DROP TABLE IF EXISTS service_price_attachments CASCADE;


-- =====================================================================
-- 3. product_os_history
--
-- A product's OWN update record. The firmware a television or a set-top box
-- ships is not a Crystal OS build at all, and even on the handsets the
-- version string a device reports is its own - so os_version is a plain
-- string and nothing joins to os_versions any more.
--
-- os_versions itself is untouched: it is still the Crystal OS product page.
-- =====================================================================

ALTER TABLE product_os_history ADD COLUMN IF NOT EXISTS os_version varchar(60);
ALTER TABLE product_os_history ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE product_os_history ADD COLUMN IF NOT EXISTS pub_approve_number varchar(60);
ALTER TABLE product_os_history ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE product_os_history ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE product_os_history ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Fill the new string from the release each row used to point at, and the
-- notes from what was written against the pairing, so nothing is lost.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'product_os_history' AND column_name = 'os_version_id')
    THEN
        UPDATE product_os_history h
           SET os_version = COALESCE(h.os_version, v.version)
          FROM os_versions v
         WHERE v.id = h.os_version_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'product_os_history' AND column_name = 'notes')
    THEN
        UPDATE product_os_history SET content = COALESCE(content, notes);
    END IF;
END $$;

UPDATE product_os_history SET os_version = 'unknown' WHERE os_version IS NULL;
ALTER TABLE product_os_history ALTER COLUMN os_version SET NOT NULL;

ALTER TABLE product_os_history DROP CONSTRAINT IF EXISTS uq_product_os;
ALTER TABLE product_os_history DROP COLUMN IF EXISTS os_version_id;
ALTER TABLE product_os_history DROP COLUMN IF EXISTS notes;

DROP INDEX IF EXISTS idx_product_os;
CREATE INDEX IF NOT EXISTS idx_product_os
    ON product_os_history(product_id, sort_order, release_date DESC);

DO $$
BEGIN
    CREATE TRIGGER trg_product_os_history_updated
        BEFORE UPDATE ON product_os_history
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
