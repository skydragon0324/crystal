-- =====================================================================
-- Delta 040 - a service centre is called a service centre.
--
-- "Location" meant two things in the CRM: a place on the map (crm_location,
-- the vendor's province/city list) and a service centre, shop or office
-- (crm_service_location). From here on:
--
--   crm_location ...........  a place on the map; every column pointing at it
--                             ends in  _location_pk
--   crm_service_center .....  a service centre, sales agency, collection
--                             point, shop, office or venue; every column
--                             pointing at it ends in  service_center_id
--
-- Renames only: no row, value or constraint changes.
-- =====================================================================

-- the service centre itself
ALTER TABLE crm_service_location RENAME TO crm_service_center;
ALTER TABLE crm_service_center RENAME COLUMN service_location_id TO service_center_id;
ALTER TABLE crm_service_center RENAME COLUMN location_code TO service_center_code;
ALTER TABLE crm_service_center RENAME COLUMN location_name TO service_center_name;
ALTER TABLE crm_service_center RENAME COLUMN location_kind TO service_center_kind;
ALTER TABLE crm_service_center RENAME COLUMN location_id TO location_pk;
ALTER TABLE crm_service_center RENAME COLUMN source_location_key TO source_service_center_key;

ALTER TABLE crm_service_location_capability RENAME TO crm_service_center_capability;
ALTER TABLE crm_service_center_capability RENAME COLUMN service_location_id TO service_center_id;

-- what happens at a service centre
ALTER TABLE crm_location_activity_type RENAME TO crm_service_center_activity_type;

ALTER TABLE crm_location_event RENAME TO crm_service_center_event;
ALTER TABLE crm_service_center_event RENAME COLUMN location_event_id TO service_center_event_id;
ALTER TABLE crm_service_center_event RENAME COLUMN service_location_id TO service_center_id;

ALTER TABLE crm_location_activity RENAME TO crm_service_center_activity;
ALTER TABLE crm_service_center_activity RENAME COLUMN location_activity_id TO service_center_activity_id;
ALTER TABLE crm_service_center_activity RENAME COLUMN service_location_id TO service_center_id;
ALTER TABLE crm_service_center_activity RENAME COLUMN location_event_id TO service_center_event_id;

ALTER TABLE crm_location_activity_target RENAME TO crm_service_center_activity_target;
ALTER TABLE crm_service_center_activity_target RENAME COLUMN location_activity_target_id TO service_center_activity_target_id;
ALTER TABLE crm_service_center_activity_target RENAME COLUMN service_location_id TO service_center_id;

ALTER TABLE crm_activity_program_location RENAME TO crm_activity_program_service_center;
ALTER TABLE crm_activity_program_service_center RENAME COLUMN program_location_id TO program_service_center_id;
ALTER TABLE crm_activity_program_service_center RENAME COLUMN service_location_id TO service_center_id;
ALTER TABLE crm_activity_program_service_center RENAME COLUMN location_role TO service_center_role;

-- columns elsewhere that point at a service centre
ALTER TABLE crm_service_case RENAME COLUMN service_location_id TO service_center_id;
ALTER TABLE crm_transaction RENAME COLUMN service_location_id TO service_center_id;
ALTER TABLE crm_product_registration RENAME COLUMN registered_at_location_id TO registered_at_service_center_id;
ALTER TABLE crm_product_transfer RENAME COLUMN handled_at_location_id TO handled_at_service_center_id;
ALTER TABLE crm_activity_program_quota RENAME COLUMN service_location_id TO service_center_id;
ALTER TABLE crm_activity_reservation RENAME COLUMN service_location_id TO service_center_id;
ALTER TABLE crm_activity_reservation_event RENAME COLUMN actor_location_id TO actor_service_center_id;
ALTER TABLE crm_activity_award RENAME COLUMN pickup_location_id TO pickup_service_center_id;
ALTER TABLE crm_point_event RENAME COLUMN performed_by_location_id TO performed_by_service_center_id;
ALTER TABLE crm_point_event RENAME COLUMN related_location_activity_id TO related_service_center_activity_id;

-- columns that point at a place on the map
ALTER TABLE crm_person RENAME COLUMN home_location_id TO home_location_pk;
ALTER TABLE crm_organization RENAME COLUMN location_id TO location_pk;
ALTER TABLE crm_activity_award RENAME COLUMN delivery_location_id TO delivery_location_pk;

-- the view reads the renamed tables; it is rebuilt under its new name
DROP VIEW IF EXISTS v_crm_location_activity_progress;
CREATE VIEW v_crm_service_center_activity_progress AS
SELECT target.service_center_activity_target_id,
       target.service_center_id,
       center.service_center_name,
       target.activity_type_id,
       activity_type.activity_code,
       target.period_start,
       target.period_end,
       target.target_quantity,
       COALESCE(SUM(activity.quantity), 0)                    AS actual_quantity,
       target.target_amount,
       COALESCE(SUM(activity.amount), 0)                      AS actual_amount,
       CASE WHEN target.target_quantity > 0
            THEN round(COALESCE(SUM(activity.quantity), 0) / target.target_quantity * 100, 1) END AS quantity_pct
FROM crm_service_center_activity_target target
JOIN crm_service_center center                 ON center.service_center_id = target.service_center_id
JOIN crm_service_center_activity_type activity_type ON activity_type.activity_type_id = target.activity_type_id
LEFT JOIN crm_service_center_activity activity ON activity.service_center_id = target.service_center_id
                                              AND activity.activity_type_id = target.activity_type_id
                                              AND activity.status = 'COMPLETED'
                                              AND activity.occurred_at >= target.period_start
                                              AND activity.occurred_at <  target.period_end + 1
GROUP BY target.service_center_activity_target_id, center.service_center_name, activity_type.activity_code;
