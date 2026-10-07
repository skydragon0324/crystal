-- Delta 049. Safe to run on a database built from the current schema.sql.

-- "Location activity" is the activity log of service centres
-- (crm_service_center_activity): it is called "Service center activity".

-- 1. An event's eligibility basis.
ALTER TABLE crm_event DROP CONSTRAINT IF EXISTS crm_event_eligibility_basis_check;
UPDATE crm_event SET eligibility_basis = 'SERVICE_CENTER_ACTIVITY' WHERE eligibility_basis = 'LOCATION_ACTIVITY';
ALTER TABLE crm_event ADD CONSTRAINT crm_event_eligibility_basis_check
  CHECK (eligibility_basis IN ('SEGMENT','POINT_RANKING','CORPORATE_GRADE','PRODUCT_REGISTRATION','SERVICE_CENTER_ACTIVITY','MANUAL','IMPORT','OPEN'));

-- 2. Why a target qualified for an event.
ALTER TABLE crm_activity_target DROP CONSTRAINT IF EXISTS crm_activity_target_source_check;
UPDATE crm_activity_target SET source = 'SERVICE_CENTER' WHERE source = 'LOCATION';
ALTER TABLE crm_activity_target ADD CONSTRAINT crm_activity_target_source_check
  CHECK (source IN ('SEGMENT','RANKING','GRADE','REGISTRATION','SERVICE_CENTER','MANUAL','IMPORT'));

-- 3. The console page keeps its id and address, so every role's grant on it carries over.
UPDATE manager_pages SET page_name = 'Service center activity', updated_at = now()
 WHERE page_url = '/admin/crm/site-activity' AND page_name = 'Location activity';

-- 4. Constraint names that said "location activity".
DO $$
DECLARE kind text;
BEGIN
  FOREACH kind IN ARRAY ARRAY['related_service_case_id','related_transaction_id','related_product_instance_id','related_reservation_id','related_award_id'] LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_location_activity_' || kind) THEN
      EXECUTE format('ALTER TABLE crm_service_center_activity RENAME CONSTRAINT %I TO %I', 'fk_location_activity_' || kind, 'fk_service_center_activity_' || kind);
    END IF;
  END LOOP;
END $$;
