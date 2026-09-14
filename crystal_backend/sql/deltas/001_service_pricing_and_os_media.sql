-- ---------------------------------------------------------------------
-- Delta 001 - the published price list grows, and an OS release can carry
-- artwork.
--
-- sql/schema.sql is the source of truth and already contains all of this;
-- this file is what brings an EXISTING database up to it, so the two must be
-- kept saying the same thing.  Every statement is written to be safe to run
-- twice - a delta that only works on a database that has never seen it is a
-- delta nobody dares run.
-- ---------------------------------------------------------------------

-- 1. The counter price and the approval reference.
--
-- `part_price` is what the repair is costed at; `sale_price` is what the part
-- sells for over the counter.  They were one number, which is why the website
-- and the counter could not both be right.
ALTER TABLE service_prices ADD COLUMN IF NOT EXISTS
    sale_price numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE service_prices ADD COLUMN IF NOT EXISTS
    approval_no varchar(60) NULL;

DO $$
BEGIN
    ALTER TABLE service_prices ADD CONSTRAINT service_prices_sale_price_check
        CHECK (sale_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing rows have no counter price of their own, and a published list
-- showing zero would be read as "free" rather than as "not filled in yet".
UPDATE service_prices SET sale_price = part_price WHERE sale_price = 0;

-- 2. The documents published beside a price line.
CREATE TABLE IF NOT EXISTS service_price_attachments (
    id               serial       PRIMARY KEY,
    service_price_id integer      NOT NULL REFERENCES service_prices(id) ON DELETE CASCADE,
    file_path        varchar(255) NOT NULL,
    file_name        varchar(200) NULL,
    sort_order       integer      NOT NULL DEFAULT 0,
    created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_price_attachments
    ON service_price_attachments(service_price_id, sort_order);

-- 3. An OS release is an owner of media, so a version can be shown with
--    pictures rather than as a wall of release notes.
DO $$
BEGIN
    ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_owner_type_check;
    ALTER TABLE media_assets ADD CONSTRAINT media_assets_owner_type_check
        CHECK (owner_type IN ('PRODUCT','SERIES','CATEGORY','ARTICLE','OS_VERSION'));
END $$;
