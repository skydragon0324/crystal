-- ---------------------------------------------------------------------
-- Delta 060 - phone numbers are stored as digits only.
--
-- A phone was kept as it was typed ("+86 135 1000 0855") next to a
-- normalised copy that still carried a leading "+". Both are now digits
-- only ("8613510000855"); the screens add the hyphens when they show a
-- number (a ten-digit number as XXX-XXX-XXXX). Comparing numbers - one
-- number belongs to one customer - is by these digits.
--
-- The same for the phone that linked a SMARTPHONE_OFFLINE account.
--
-- Safe to run twice and on a database built from the current schema.sql.
-- ---------------------------------------------------------------------

UPDATE crm_contact_point
   SET contact_value    = regexp_replace(contact_value, '[^0-9]', '', 'g'),
       normalized_value = regexp_replace(normalized_value, '[^0-9]', '', 'g')
 WHERE contact_type IN ('MOBILE', 'PHONE', 'SIM_CID')
   AND (contact_value ~ '[^0-9]' OR normalized_value ~ '[^0-9]');

UPDATE crm_project_account
   SET matched_phone = regexp_replace(matched_phone, '[^0-9]', '', 'g')
 WHERE matched_phone ~ '[^0-9]';

COMMENT ON COLUMN crm_contact_point.contact_value IS 'The value as entered; a phone (MOBILE, PHONE, SIM_CID) is kept as digits only, and screens format it for display.';
