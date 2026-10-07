-- Delta 046. Safe to run on a database built from the current schema.sql.

-- A manager can give a customer a corporate grade by hand. It stands in for
-- the grade the analysis run computes until it is cleared; the computed grade
-- stays on the snapshots so both can be seen.
ALTER TABLE crm_party ADD COLUMN IF NOT EXISTS assigned_grade_id smallint NULL REFERENCES crm_corporate_grade(corporate_grade_id);
ALTER TABLE crm_party ADD COLUMN IF NOT EXISTS assigned_grade_reason varchar(500) NULL;
ALTER TABLE crm_party ADD COLUMN IF NOT EXISTS assigned_grade_at timestamptz NULL;
ALTER TABLE crm_party ADD COLUMN IF NOT EXISTS assigned_grade_by_manager_id integer NULL REFERENCES managers(id) ON DELETE SET NULL;
COMMENT ON COLUMN crm_party.assigned_grade_id IS 'Corporate grade set by a manager; overrides the computed grade from the latest analysis snapshot while set.';
CREATE INDEX IF NOT EXISTS idx_crm_party_assigned_grade ON crm_party(assigned_grade_id) WHERE assigned_grade_id IS NOT NULL;
