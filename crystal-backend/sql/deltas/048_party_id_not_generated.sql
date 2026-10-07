-- Delta 048. Safe to run on a database built from the current schema.sql.

-- crm_party.party_id is reserved for a later phase. Phase 1 links and shows
-- customers by party_pk only, so nothing generates a party_id any more: the
-- column stays, empty, until it is used. Values the old default generated were
-- never shown or read, and are cleared.
ALTER TABLE crm_party ALTER COLUMN party_id DROP DEFAULT;
ALTER TABLE crm_party ALTER COLUMN party_id DROP NOT NULL;
UPDATE crm_party SET party_id = NULL WHERE party_id IS NOT NULL;
COMMENT ON COLUMN crm_party.party_id IS 'Reserved public identifier for a later phase. Not generated or used in phase 1: customers are identified by party_pk.';
