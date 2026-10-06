-- =====================================================================
-- Delta 039 - crm_location becomes the vendor's location list.
--
-- Run by src/db/migrations/20261002110000_crm_location_is_the_vendor_list.js,
-- in two parts around the step that copies the vendor's rows and re-points
-- the columns that used crm_location (they need the old and the new table at
-- the same time):
--
--   PART 1  the new table, beside the old one
--   (js)    copy ora_pid.locations into it; move every *_location_id from the
--           old location_id to the vendor location_pk of the same name
--   PART 2  the old table goes, the new one takes its name, the keys return
-- =====================================================================

-- @@ PART 1
CREATE TABLE crm_location_next (
    location_pk                        bigint         PRIMARY KEY,
    location_name                      varchar(100)   NOT NULL,
    location_code                      varchar(8)     NOT NULL UNIQUE,
    parent_code                        varchar(8)     NULL,
    position                           smallint       NOT NULL DEFAULT 0,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now()
);

-- @@ PART 2
DROP TABLE crm_location CASCADE;
ALTER TABLE crm_location_next RENAME TO crm_location;
ALTER INDEX crm_location_next_pkey RENAME TO crm_location_pkey;
ALTER INDEX crm_location_next_location_code_key RENAME TO crm_location_location_code_key;
COMMENT ON TABLE crm_location IS 'The vendor location list (ora_pid.locations), same columns and keys. Province = parent_code NULL or 0.';
COMMENT ON COLUMN crm_location.parent_code IS 'Parent location_code; NULL or 0 for a province.';
CREATE INDEX idx_crm_location_parent ON crm_location(parent_code, position);
CREATE TRIGGER trg_crm_location_updated BEFORE UPDATE ON crm_location
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

ALTER TABLE crm_person ADD CONSTRAINT crm_person_home_location_id_fkey
    FOREIGN KEY (home_location_id) REFERENCES crm_location(location_pk);
ALTER TABLE crm_organization ADD CONSTRAINT crm_organization_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES crm_location(location_pk);
ALTER TABLE crm_service_location ADD CONSTRAINT crm_service_location_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES crm_location(location_pk);
ALTER TABLE crm_activity_award ADD CONSTRAINT crm_activity_award_delivery_location_id_fkey
    FOREIGN KEY (delivery_location_id) REFERENCES crm_location(location_pk);
