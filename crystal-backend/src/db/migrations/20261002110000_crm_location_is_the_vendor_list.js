/**
 * Delta 039 - crm_location becomes the vendor's location list
 * (sql/deltas/039_crm_location_is_the_vendor_list.sql).
 *
 * A database built from the CURRENT schema.sql already has the new table, so
 * this runs only where crm_location still has the old location_id column.
 *
 * The vendor's rows are copied when the vendor's schema is reachable from
 * this database (LEGACY_DRIVER=postgres - a development database, or one
 * where the vendor's tables sit beside Crystal's). Otherwise the table starts
 * empty and the CRM import's "locations" step fills it from Oracle.
 *
 * Every column that pointed at the old table is moved to the vendor row with
 * the same name - a province called "Guangdong" before is the vendor's
 * "Guangdong" after. A name the vendor does not have is cleared, and the
 * count of those is printed, so nothing is dropped silently.
 */
const fs = require('fs');
const path = require('path');

const config = require('../../config');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '039_crm_location_is_the_vendor_list.sql');

/* table, column: every place the CRM points at a location */
const POINTERS = [
  ['crm_person', 'home_location_id'],
  ['crm_organization', 'location_id'],
  ['crm_service_location', 'location_id'],
  ['crm_activity_award', 'delivery_location_id']
];

function part(sql, name) {
  const pieces = sql.split(/^-- @@ /m);
  const piece = pieces.filter(function (text) { return text.indexOf(name) === 0; })[0];
  return piece.slice(piece.indexOf('\n') + 1);
}

exports.up = async function up(knex) {
  const old = await knex.raw(`SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'crm_location' AND column_name = 'location_id'`);
  if (!old.rows.length) return;

  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  await knex.raw(part(sql, 'PART 1'));

  /* the vendor's rows, when its schema is in this database */
  const schema = config.legacy.pidSchema;
  if (config.legacy.driver === 'postgres' && schema) {
    const found = await knex.raw('SELECT to_regclass(?) AS found', [schema + '.locations']);
    if (found.rows[0].found) {
      const copied = await knex.raw(`
        INSERT INTO crm_location_next (location_pk, location_name, location_code, parent_code, position, created_at, updated_at)
        SELECT location_pk, location_name, location_code, parent_code, COALESCE(position, 0),
               COALESCE(created_at, now()), COALESCE(updated_at, now())
          FROM ??.locations`, [schema]);
      // eslint-disable-next-line no-console
      console.log('  crm_location: ' + copied.rowCount + ' vendor locations copied');
    }
  }

  /* the columns that pointed at the old rows: same name, top level first */
  for (let index = 0; index < POINTERS.length; index += 1) {
    const table = POINTERS[index][0];
    const column = POINTERS[index][1];
    // eslint-disable-next-line no-await-in-loop
    const exists = await knex.raw('SELECT to_regclass(?) AS found', [table]);
    if (!exists.rows[0].found) continue;

    // eslint-disable-next-line no-await-in-loop
    const before = await knex.raw('SELECT count(*)::int AS n FROM ?? WHERE ?? IS NOT NULL', [table, column]);
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, table + '_' + column + '_fkey']);
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`
      UPDATE ?? target SET ?? = (
        SELECT next_location.location_pk FROM crm_location old_location
          JOIN crm_location_next next_location ON lower(trim(next_location.location_name)) = lower(trim(old_location.location_name))
         WHERE old_location.location_id = target.??
         ORDER BY (next_location.parent_code IS NULL OR next_location.parent_code IN ('', '0')) DESC, next_location.position, next_location.location_pk
         LIMIT 1)
       WHERE target.?? IS NOT NULL`, [table, column, column, column]);
    // eslint-disable-next-line no-await-in-loop
    const after = await knex.raw('SELECT count(*)::int AS n FROM ?? WHERE ?? IS NOT NULL', [table, column]);
    // eslint-disable-next-line no-console
    console.log('  ' + table + '.' + column + ': ' + after.rows[0].n + ' of ' + before.rows[0].n
      + ' moved to a vendor location; ' + (before.rows[0].n - after.rows[0].n) + ' had no vendor location of that name and were cleared');
  }

  await knex.raw(part(sql, 'PART 2'));
};

/* The old ids are gone; there is nothing to move the columns back to. */
exports.down = async function down() {
  throw new Error('039 cannot be rolled back: crm_location now holds the vendor rows and keys');
};
