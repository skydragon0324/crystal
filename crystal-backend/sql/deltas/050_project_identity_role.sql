-- Delta 050. Safe to run on a database built from the current schema.sql.

-- Which project plays which part in customer identity, chosen in Settings >
-- Projects instead of being fixed by project code:
--   ESHOP            the e-shop: the Excel import's E-shop PK / ID columns
--   USER_MANAGEMENT  the user management system: the Excel import's User PK /
--                    User ID columns, and the user_pk that merges rows
-- At most one project has each role.
ALTER TABLE crm_project ADD COLUMN IF NOT EXISTS identity_role varchar(30) NULL;
ALTER TABLE crm_project DROP CONSTRAINT IF EXISTS crm_project_identity_role_check;
ALTER TABLE crm_project ADD CONSTRAINT crm_project_identity_role_check CHECK (identity_role IN ('ESHOP','USER_MANAGEMENT'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_project_identity_role ON crm_project(identity_role) WHERE identity_role IS NOT NULL;
COMMENT ON COLUMN crm_project.identity_role IS 'ESHOP or USER_MANAGEMENT: the project whose identifiers the Excel import carries in its E-shop and User columns. At most one project per role.';
