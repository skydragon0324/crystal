/**
 * Delta 011, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '011_vocabularies_are_enum_types.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Back to varchar, and NOT back to the CHECK constraints.
   *
   * The type carried the vocabulary; a check constraint carried a copy of it
   * per column, and those copies are exactly what this migration removed. The
   * honest reversal is the column type, which is reversible, and not the
   * duplication, which is not worth restoring. Widening a column loses no
   * data - every value already came out of the enum.
   *
   * The view has to come down and go back for the same reason as on the way
   * up: it reads two of these columns.
   */
  await knex.raw(`
    DO $$
    DECLARE
        target   record;
        view_sql text;
        literal  text;
    BEGIN
        IF to_regclass('v_agency_health') IS NOT NULL THEN
            view_sql := pg_get_viewdef(to_regclass('v_agency_health'), true);
            EXECUTE 'DROP VIEW v_agency_health';
        END IF;

        FOR target IN
            SELECT c.table_name AS tbl, c.column_name AS col, c.column_default AS dflt
              FROM information_schema.columns c
              JOIN pg_type t ON t.typname = c.udt_name
             WHERE c.table_schema = current_schema()
               AND t.typtype = 'e'
        LOOP
            /* A default of the enum type cannot be cast along with the
               column, so it comes off first and goes back as a string. */
            IF target.dflt IS NOT NULL THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', target.tbl, target.col);
            END IF;

            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN %I TYPE varchar(30) USING %I::text',
                target.tbl, target.col, target.col
            );

            IF target.dflt IS NOT NULL THEN
                literal := substring(target.dflt from '^''(.*)''::');
                IF literal IS NOT NULL THEN
                    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %L',
                        target.tbl, target.col, literal);
                END IF;
            END IF;
        END LOOP;

        IF view_sql IS NOT NULL THEN
            EXECUTE 'CREATE VIEW v_agency_health AS ' || view_sql;
        END IF;
    END $$;
  `);

  await knex.raw(`
    DO $$
    DECLARE
        doomed record;
    BEGIN
        FOR doomed IN
            SELECT t.typname
              FROM pg_type t
              JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE t.typtype = 'e' AND n.nspname = current_schema()
        LOOP
            EXECUTE format('DROP TYPE IF EXISTS %I', doomed.typname);
        END LOOP;
    END $$;
  `);
};
