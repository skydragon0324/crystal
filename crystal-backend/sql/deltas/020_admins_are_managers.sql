-- ---------------------------------------------------------------------
-- Delta 020 - the people who run the console are MANAGERS.
--
-- Crystal called them admins; the platform they share their members with has
-- always called them managers, and the two words have been sitting next to
-- each other in this codebase since the feedback integration landed:
--
--   crystal_v1.managers.id      ==  ora_pid.managers.manager_pk
--
-- A thread's `session_by` is one of these numbers, and which word you use
-- depends only on which side of the join you are reading. That is the kind of
-- split that makes somebody write the wrong column name at three in the
-- morning, so Crystal adopts the platform's word.
--
--   admins             ->  managers
--   admin_roles        ->  manager_roles
--   admin_pages        ->  manager_pages
--   admin_permissions  ->  manager_permissions
--
-- And the four columns that name one:
--
--   audit_log.manager_id / manager_login / manager_name
--   part_movements.manager_id
--   repair_ticket_events.manager_id
--
-- WHAT DOES NOT CHANGE, deliberately:
--
--   * the console's URL space. /admin/catalog/products is where the console
--     lives in a browser and what `manager_pages.page_url` stores; renaming it
--     would invalidate every bookmark and every permission row for a word that
--     is not a table name.
--   * the API's routes. /api/admin/... is the console half of the API.
--   * `is_system` on a role, `permission` on a grant - those never said admin.
--
-- RENAMING A TABLE DOES NOT RENAME WHAT HANGS OFF IT. PostgreSQL carries the
-- primary key, the unique keys, the foreign keys, the sequences and the
-- indexes across under their OLD names, so a table called `managers` would
-- still refuse a duplicate with "admins_username_key". Section 3 fixes that,
-- which is also what keeps an upgraded database identical to a fresh one.
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. THE TABLES
--
-- Guarded individually rather than as one block: a delta that is half applied
-- has to be able to finish, and `to_regclass` is how each statement asks
-- whether its own work is already done.
-- ---------------------------------------------------------------------

/*
 * THE CHECK IS SCOPED TO THIS SCHEMA, and that is not pedantry.
 *
 * The obvious guard is `to_regclass('managers') IS NULL`, and it is wrong
 * here: to_regclass resolves an unqualified name through the SEARCH PATH, and
 * this database has a `managers` table in `public` belonging to another
 * project - as well as the vendor's in ora_pid. The guard saw one of those,
 * concluded the rename had already happened, and silently did nothing while
 * every other section of this file ran. The result was a table called
 * `admins` with an index called `managers_pkey`.
 *
 * So existence is asked of the catalogue, restricted to current_schema(),
 * which is the only place this delta has any business looking.
 */
DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT * FROM (VALUES
            ('admins', 'managers'),
            ('admin_roles', 'manager_roles'),
            ('admin_pages', 'manager_pages'),
            ('admin_permissions', 'manager_permissions')
        ) AS t(old_name, new_name)
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = current_schema()
               AND c.relname = target.old_name
               AND c.relkind = 'r'
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = current_schema()
               AND c.relname = target.new_name
               AND c.relkind = 'r'
        ) THEN
            EXECUTE format('ALTER TABLE %I RENAME TO %I', target.old_name, target.new_name);
        END IF;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 2. THE COLUMNS THAT NAME ONE
-- ---------------------------------------------------------------------

DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT c.table_name, c.column_name
          FROM information_schema.columns c
         WHERE c.table_schema = current_schema()
           AND c.column_name IN ('admin_id', 'admin_login', 'admin_name')
    LOOP
        EXECUTE format(
            'ALTER TABLE %I RENAME COLUMN %I TO %I',
            target.table_name,
            target.column_name,
            replace(target.column_name, 'admin_', 'manager_')
        );
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3. EVERYTHING THAT HANGS OFF THEM
--
-- Sequences, constraints and indexes keep the name they were created with
-- when a table is renamed - including the ones PostgreSQL generated. Left
-- alone, `managers` refuses a duplicate username with "admins_username_key",
-- and a fresh install built from schema.sql would carry different names from
-- an upgraded one. Both are worth avoiding, and both are the same fix.
--
-- Each loop re-reads the catalogue and renames only what still carries the old
-- word, so running this twice does nothing the second time.
-- ---------------------------------------------------------------------

/* 3a. sequences behind the serial keys */
DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT sequence_name
          FROM information_schema.sequences
         WHERE sequence_schema = current_schema()
           AND sequence_name LIKE 'admin%'
    LOOP
        EXECUTE format(
            'ALTER SEQUENCE %I RENAME TO %I',
            target.sequence_name,
            'manager' || substring(target.sequence_name from 6)
        );
    END LOOP;
END $$;

/*
 * 3b. constraints - primary keys, unique keys, foreign keys and checks.
 *
 * Only those on the four renamed tables, so a constraint elsewhere that
 * happens to contain the word is left alone. The new name substitutes the
 * FIRST occurrence only: `admin_permissions_page_id_fkey` becomes
 * `manager_permissions_page_id_fkey`, and nothing inside the column part of
 * the name is touched.
 */
DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT t.relname AS table_name, c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = current_schema()
           AND t.relname IN ('managers', 'manager_roles', 'manager_pages', 'manager_permissions')
           AND c.conname LIKE 'admin%'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
            target.table_name,
            target.conname,
            'manager' || substring(target.conname from 6)
        );
    END LOOP;
END $$;

/*
 * 3c. indexes that are not already covered by a constraint.
 *
 * Renaming a constraint renames the index behind it, so what is left here is
 * the ones created with CREATE INDEX - `idx_admins_role` and `idx_audit_admin`.
 * The second is on `audit_log`, which is not one of the renamed tables, so it
 * is matched by name rather than by table.
 */
DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT indexname
          FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname LIKE '%admin%'
    LOOP
        EXECUTE format(
            'ALTER INDEX %I RENAME TO %I',
            target.indexname,
            replace(target.indexname, 'admin', 'manager')
        );
    END LOOP;
END $$;

/* 3d. and the updated_at triggers */
DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT t.relname AS table_name, g.tgname
          FROM pg_trigger g
          JOIN pg_class t ON t.oid = g.tgrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = current_schema()
           AND NOT g.tgisinternal
           AND g.tgname LIKE '%admin%'
    LOOP
        EXECUTE format(
            'ALTER TRIGGER %I ON %I RENAME TO %I',
            target.tgname,
            target.table_name,
            replace(target.tgname, 'admin', 'manager')
        );
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 4. THE COMMENTS THAT NAMED THE OLD WORD
-- ---------------------------------------------------------------------

COMMENT ON TABLE managers IS
  'the people who run the console. Called managers rather than admins because
   that is what the platform Crystal shares its members with calls them, and
   managers.id is the same number as ora_pid.managers.manager_pk - a feedback
   thread''s session_by is one of these either way.';

COMMENT ON COLUMN audit_log.manager_id IS
  'who did it. Kept alongside the login and the name so the log still reads
   after the account is deleted.';
