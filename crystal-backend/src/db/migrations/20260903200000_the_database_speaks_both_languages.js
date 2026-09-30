/**
 * Delta 022, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '022_the_database_speaks_both_languages.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * CREATE OR REPLACE, so rolling back means putting the unqualified RAISEs
   * back rather than dropping anything. The guards keep working either way -
   * what changes is that every one of them reports P0001 again, and the API
   * goes back to answering in English whatever the reader asked for.
   */
  await knex.raw(`
    CREATE OR REPLACE FUNCTION check_ticket_warranty() RETURNS trigger AS $$
    DECLARE
        w RECORD;
    BEGIN
        IF NEW.is_warranty IS NOT TRUE THEN
            RETURN NEW;
        END IF;

        IF NEW.warranty_id IS NULL THEN
            RAISE EXCEPTION 'a covered repair must name the warranty covering it';
        END IF;

        SELECT serial_number, start_date, end_date, status
          INTO w
          FROM warranties
         WHERE id = NEW.warranty_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'warranty % does not exist', NEW.warranty_id;
        END IF;

        IF w.serial_number <> NEW.serial_number THEN
            RAISE EXCEPTION 'warranty % covers device %, not %',
                NEW.warranty_id, w.serial_number, NEW.serial_number;
        END IF;

        IF w.status = 'VOID' THEN
            RAISE EXCEPTION 'warranty % has been voided', NEW.warranty_id;
        END IF;

        IF NEW.received_at::date < w.start_date OR NEW.received_at::date > w.end_date THEN
            RAISE EXCEPTION 'warranty % ran from % to % and the device arrived on %',
                NEW.warranty_id, w.start_date, w.end_date, NEW.received_at::date;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
};
