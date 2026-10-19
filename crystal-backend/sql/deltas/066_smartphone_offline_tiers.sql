-- ---------------------------------------------------------------------
-- Delta 066 - the SMARTPHONE_OFFLINE system's levels and grades, as tiers.
--
-- That system ranks each of its users twice, and says so through
-- getLevelInfo: `loyal_level` is the CRM's LEVEL and `purchase_level` its
-- GRADE, each a number from 1 to 5. The Accounts tab's Sync levels / grades
-- puts every linked account on the tier whose "Code in the project"
-- (source_code) is the number the system sent, so the tiers are added here
-- with those codes: LV1..LV5 and GD1..GD5, ranked 1..5.
--
-- A tier the project already has under the same code keeps its name and
-- only gains the source code and rank it is missing - LEVEL 1 (LV1) was
-- added by hand before the sync existed. A value the system sends that has
-- no tier is reported by the sync, not guessed; add it in Settings > Project
-- tiers with that number as its Code in the project.
--
-- Only where the project exists (it is added in Settings > Projects, with
-- the code SMARTPHONE_OFFLINE_PROJECT_CODE names - SMARTPHONE_OFFLINE unless
-- set), and safe to run twice.
-- ---------------------------------------------------------------------

INSERT INTO crm_project_tier (project_id, tier_kind, tier_code, tier_name, rank_no, source_code, is_active)
SELECT project.project_id, ladder.tier_kind, ladder.prefix || step.n, ladder.word || ' ' || step.n, step.n, step.n::text, true
  FROM crm_project project
 CROSS JOIN (VALUES ('LEVEL', 'LV', 'Level'), ('GRADE', 'GD', 'Grade')) AS ladder (tier_kind, prefix, word)
 CROSS JOIN generate_series(1, 5) AS step (n)
 WHERE project.project_code = 'SMARTPHONE_OFFLINE'
   AND EXISTS (SELECT 1 FROM crm_tier_kind kind WHERE kind.kind_code = ladder.tier_kind)
ON CONFLICT (project_id, tier_kind, tier_code) DO UPDATE
   SET source_code = COALESCE(crm_project_tier.source_code, EXCLUDED.source_code),
       rank_no = COALESCE(crm_project_tier.rank_no, EXCLUDED.rank_no);
