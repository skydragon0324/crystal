-- ---------------------------------------------------------------------
-- Delta 067 - an organization is known by one name.
--
-- An organization had four names: the party's display_name, which the CRM
-- shows and searches everywhere, and a legal, a trading and a local name on
-- crm_organization. The three were shown in one card at most, searched
-- nowhere, and the trading name started as a copy of the display name and
-- drifted from it. The CRM keeps the one name now; the three columns go.
--
-- Safe to run twice, and on a database built from the current schema.sql,
-- which no longer has them.
-- ---------------------------------------------------------------------

ALTER TABLE crm_organization DROP COLUMN IF EXISTS legal_name;
ALTER TABLE crm_organization DROP COLUMN IF EXISTS trading_name;
ALTER TABLE crm_organization DROP COLUMN IF EXISTS local_name;
