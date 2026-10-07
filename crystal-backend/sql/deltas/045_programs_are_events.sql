-- Delta 045 - an activity "program" is an "event".
--
-- crm_activity_program[_tier|_quota|_service_center] -> crm_event[...],
-- every *program* column, constraint, index and sequence follows the same rule
-- (activity_program -> event, then program -> event), and the code values
-- PROGRAM, PROGRAM_NOTICE, PROGRAM_AWARD, PROGRAM_TARGETS, PROGRAM_PICKUP_DAY
-- and PROGRAM_ENTRY become EVENT[_...]. Safe to run twice and on a database
-- built from the current schema.sql (there is nothing left to rename).

DO $$
DECLARE
    r       record;
    renamed text;
BEGIN
    -- tables
    FOR r IN SELECT relname FROM pg_class
              WHERE relnamespace = current_schema()::regnamespace AND relkind = 'r' AND relname ~ '^crm_.*program' LOOP
        renamed := replace(replace(r.relname, 'activity_program', 'event'), 'program', 'event');
        EXECUTE format('ALTER TABLE %I RENAME TO %I', r.relname, renamed);
    END LOOP;

    -- columns
    FOR r IN SELECT table_name, column_name FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name LIKE 'crm\_%' AND column_name ~ 'program' LOOP
        renamed := replace(replace(r.column_name, 'activity_program', 'event'), 'program', 'event');
        EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.table_name, r.column_name, renamed);
    END LOOP;

    -- constraints (a primary key or unique constraint takes its index with it)
    FOR r IN SELECT conrelid::regclass::text AS table_name, conname FROM pg_constraint
              WHERE connamespace = current_schema()::regnamespace AND contype IN ('c','f','p','u','x')
                AND conname ~ 'program' AND conrelid::regclass::text LIKE 'crm\_%' LOOP
        renamed := replace(replace(r.conname, 'activity_program', 'event'), 'program', 'event');
        EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.table_name, r.conname, renamed);
    END LOOP;

    -- indexes and sequences left over
    FOR r IN SELECT relname, relkind FROM pg_class
              WHERE relnamespace = current_schema()::regnamespace AND relkind IN ('i','S') AND relname ~ 'program' LOOP
        renamed := replace(replace(r.relname, 'activity_program', 'event'), 'program', 'event');
        IF r.relkind = 'i' THEN
            EXECUTE format('ALTER INDEX %I RENAME TO %I', r.relname, renamed);
        ELSE
            EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', r.relname, renamed);
        END IF;
    END LOOP;
END $$;

-- Code values: lift the CHECKs that list them, rewrite the rows, put the CHECKs back.
CREATE TEMP TABLE delta045_checks ON COMMIT DROP AS
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE connamespace = current_schema()::regnamespace AND contype = 'c'
   AND conrelid::regclass::text LIKE 'crm\_%' AND pg_get_constraintdef(oid) ~ '''PROGRAM(_[A-Z]+)*''';

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT * FROM delta045_checks LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.conname);
    END LOOP;

    FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c
               JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
              WHERE c.table_schema = current_schema() AND c.table_name LIKE 'crm\_%'
                AND c.data_type IN ('character varying', 'text') LOOP
        EXECUTE format('UPDATE %I SET %I = replace(%I, ''PROGRAM'', ''EVENT'') WHERE %I IN (''PROGRAM'', ''PROGRAM_NOTICE'', ''PROGRAM_AWARD'', ''PROGRAM_TARGETS'', ''PROGRAM_PICKUP_DAY'', ''PROGRAM_ENTRY'')',
                       r.table_name, r.column_name, r.column_name, r.column_name);
    END LOOP;

    FOR r IN SELECT * FROM delta045_checks LOOP
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.table_name, r.conname,
                       regexp_replace(r.definition, '''PROGRAM', '''EVENT', 'g'));
    END LOOP;
END $$;

-- The seeded names that said "program".
UPDATE crm_communication_purpose SET purpose_name = 'Event notice' WHERE purpose_code = 'EVENT_NOTICE' AND purpose_name = 'Program notice';
UPDATE crm_point_event_type SET display_name = 'Event award' WHERE event_code = 'EVENT_AWARD' AND display_name = 'Program award';

UPDATE crm_acquisition_type SET acquisition_name = 'Event prize' WHERE acquisition_code = 'PRIZE' AND acquisition_name = 'Program prize';

-- The console page keeps its id, so every role's grant on it carries over.
UPDATE manager_pages SET page_url = '/admin/crm/events', page_name = 'Events', updated_at = now()
 WHERE page_url = '/admin/crm/programs';
