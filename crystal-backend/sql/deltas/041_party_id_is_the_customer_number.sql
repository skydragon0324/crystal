-- =====================================================================
-- 041 - party_id is the customer number; crm_party.party_no is dropped.
--
-- Every table already points at a party by party_id, so nothing else
-- changes shape. Screens show a customer as "#<party_id>" and search by it.
--
-- Look-alike candidates queued by the console carried the newer party's
-- party_no as their incoming record id; they carry its party_id from now on,
-- so the old rows are rewritten to match before the column goes.
-- =====================================================================

UPDATE crm_identity_match_candidate candidate
   SET incoming_external_record_id = party.party_id::text
  FROM crm_party party
 WHERE candidate.incoming_party_id = party.party_id
   AND candidate.incoming_external_record_id = party.party_no;

ALTER TABLE crm_party DROP COLUMN party_no;
DROP SEQUENCE IF EXISTS crm_party_no_seq;
