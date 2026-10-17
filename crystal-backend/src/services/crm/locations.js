const db = require('../../config/db');
const legacy = require('../../config/legacy');

/**
 * THE VENDOR'S LOCATION LIST, READ ONE WAY.
 *
 * crm_location is bs_prhnid.locations copied as it is: location_pk is the key,
 * and the hierarchy runs on codes - a row's parent_code is its parent's
 * location_code, and a province has parent_code NULL or '0'. The vendor goes
 * at most three levels deep (province > city > district).
 *
 * Every screen that names a location says it the same way, "Province / City /
 * District", so the full name is built here and nowhere else.
 */

const TOP = "(%s.parent_code IS NULL OR %s.parent_code IN ('', '0'))";

/** SQL: true when the row is a province. */
function isTop(alias) {
  return TOP.replace(/%s/g, alias);
}

/**
 * SQL: the full name of the location whose key is in `column`
 * ("Province / City / District"), as a correlated subquery. The subquery
 * names its rows place / parent_place / grandparent_place, so `column` must
 * not be qualified with one of those aliases (it would point inside).
 */
function fullNameOf(column) {
  return `(SELECT concat_ws(' / ', grandparent_place.location_name, parent_place.location_name, place.location_name)
             FROM crm_location place
             LEFT JOIN crm_location parent_place ON parent_place.location_code = place.parent_code AND NOT ${isTop('place')}
             LEFT JOIN crm_location grandparent_place ON grandparent_place.location_code = parent_place.parent_code AND NOT ${isTop('parent_place')}
            WHERE place.location_pk = ${column})`;
}

/**
 * Every location with its full name and level, ordered the vendor's way.
 * `location_id` repeats location_pk for the pickers, which key on it.
 */
async function all(trx) {
  const query = trx || db;
  const rows = await query('crm_location as listed_place')
    .select('listed_place.location_pk', 'listed_place.location_pk as location_id', 'listed_place.location_name',
      'listed_place.location_code', 'listed_place.parent_code', 'listed_place.position',
      query.raw(fullNameOf('listed_place.location_pk') + ' AS full_name'))
    .orderBy([{ column: 'listed_place.position' }, { column: 'listed_place.location_name' }]);

  const byCode = {};
  rows.forEach(function (row) { byCode[row.location_code] = row; });
  rows.forEach(function (row) {
    let depth = 0;
    let parent = row.parent_code && row.parent_code !== '0' ? byCode[row.parent_code] : null;
    while (parent && depth < 5) {
      depth += 1;
      parent = parent.parent_code && parent.parent_code !== '0' ? byCode[parent.parent_code] : null;
    }
    row.level = depth; // 0 province, 1 city, 2 district
  });
  return rows.sort(function (left, right) { return String(left.full_name).localeCompare(String(right.full_name)); });
}


/**
 * THE VENDOR'S LOCATION LIST, copied as it is: same columns, same keys
 * (crm_location.location_pk = bs_prhnid.locations.location_pk). Read through the
 * legacy handle, so it works whether the vendor runs on PostgreSQL or Oracle.
 * A row already here is updated; nothing is deleted - a location a customer
 * points at stays even if the vendor removes it.
 */
async function refresh(connection) {
  const rows = await legacy.connection()(legacy.pid('locations'))
    .select('location_pk', 'location_name', 'location_code', 'parent_code', 'position');
  let added = 0;
  let updated = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    // eslint-disable-next-line no-await-in-loop
    const result = await connection.raw(`
      INSERT INTO crm_location (location_pk, location_name, location_code, parent_code, position)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (location_pk) DO UPDATE SET
        location_name = EXCLUDED.location_name, location_code = EXCLUDED.location_code,
        parent_code = EXCLUDED.parent_code, position = EXCLUDED.position
      RETURNING (xmax = 0) AS inserted`,
    [row.location_pk, row.location_name, row.location_code, row.parent_code === undefined ? null : row.parent_code, Number(row.position) || 0]);
    if (result.rows[0] && result.rows[0].inserted) added += 1; else updated += 1;
  }
  return { added: added, updated: updated };
}

module.exports = {
  refresh: refresh,
  isTop: isTop,
  fullNameOf: fullNameOf,
  all: all
};
