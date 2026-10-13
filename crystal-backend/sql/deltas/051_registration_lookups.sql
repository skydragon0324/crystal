-- Delta 051. Safe to run on a database built from the current schema.sql.
--
-- Every customer the CRM creates leaves a registration behind, so
-- crm_registration_intake grows with the customer base. The review screens
-- look registrations up two ways that had no index and read the whole table:
--
--   by customer     the identifiers an Excel import listed for a candidate
--   by account id   whether that identifier is already under review
--
-- With these, opening a pending registration or an account assignment costs
-- the same with a thousand customers or a million.
CREATE INDEX IF NOT EXISTS idx_crm_intake_party ON crm_registration_intake(party_pk) WHERE party_pk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_intake_eshop_record ON crm_registration_intake(source_record_id) WHERE category = 'ESHOP';
