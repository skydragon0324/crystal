-- ---------------------------------------------------------------------
-- Delta 057 - two merged customers can be separated again.
--
-- A merge now writes down, in crm_party_merge_history.merge_metadata, every
-- row it moved and what it overwrote. Separating them (unmerge) puts those
-- rows back and records when, by whom, why, and how many rows went back.
-- A merge made before this delta has no such record and cannot be undone.
--
-- Safe to run twice and on a database built from the current schema.sql.
-- ---------------------------------------------------------------------

ALTER TABLE crm_party_merge_history ADD COLUMN IF NOT EXISTS unmerged_at timestamptz NULL;
ALTER TABLE crm_party_merge_history ADD COLUMN IF NOT EXISTS unmerged_by_manager_id integer NULL REFERENCES managers(id) ON DELETE SET NULL;
ALTER TABLE crm_party_merge_history ADD COLUMN IF NOT EXISTS unmerge_reason varchar(250) NULL;
ALTER TABLE crm_party_merge_history ADD COLUMN IF NOT EXISTS restored_rows jsonb NULL;

COMMENT ON COLUMN crm_party_merge_history.merge_metadata IS 'What an unmerge needs: every row the merge moved, with the values it overwrote.';
COMMENT ON COLUMN crm_party_merge_history.unmerged_at IS 'When the two customers were separated again; NULL while merged.';
