/**
 * Delta 020, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '020_admins_are_managers.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * The tables back, and only the tables. The derived names - sequences,
   * constraints, indexes, triggers - are left saying `manager`, because a
   * rollback that half-renames is worse than one that is obviously partial:
   * anybody reading `managers_pkey` on a table called `admins` knows exactly
   * which direction this went, and a fresh install from schema.sql at that
   * commit builds the right names anyway.
   */
  await knex.raw(`
    DO $$
    BEGIN
        IF to_regclass('manager_permissions') IS NOT NULL THEN
            ALTER TABLE manager_permissions RENAME TO admin_permissions;
        END IF;
        IF to_regclass('manager_pages') IS NOT NULL THEN
            ALTER TABLE manager_pages RENAME TO admin_pages;
        END IF;
        IF to_regclass('manager_roles') IS NOT NULL THEN
            ALTER TABLE manager_roles RENAME TO admin_roles;
        END IF;
        IF to_regclass('managers') IS NOT NULL THEN
            ALTER TABLE managers RENAME TO admins;
        END IF;
    END $$;
  `);

  await knex.raw(`
    DO $$
    DECLARE
        target record;
    BEGIN
        FOR target IN
            SELECT c.table_name, c.column_name
              FROM information_schema.columns c
             WHERE c.table_schema = current_schema()
               AND c.column_name IN ('manager_id', 'manager_login', 'manager_name')
               AND c.table_name IN ('audit_log', 'part_movements', 'repair_ticket_events')
        LOOP
            EXECUTE format(
                'ALTER TABLE %I RENAME COLUMN %I TO %I',
                target.table_name,
                target.column_name,
                replace(target.column_name, 'manager_', 'admin_')
            );
        END LOOP;
    END $$;
  `);
};
