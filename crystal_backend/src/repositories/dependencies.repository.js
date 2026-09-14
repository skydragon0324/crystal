const db = require('../config/db');
const config = require('../config');

/**
 * WHAT ELSE POINTS AT THIS ROW.
 *
 * Asked before a permanent delete, so the console can say "3 repair tickets
 * and 12 price lines" rather than letting Postgres throw a foreign key error
 * on click. The difference matters: one is a sentence somebody can act on, the
 * other is a 500 with a constraint name in it.
 *
 * THE ANSWER COMES FROM THE DATABASE, not from a list kept by hand. Every
 * table that references this one is discovered from the catalogue, so a
 * relationship added next year is covered without anybody remembering to come
 * back here - which is exactly the kind of list that rots.
 *
 * A reference is one of three things, and they are NOT the same:
 *
 *   BLOCKS     ON DELETE RESTRICT or NO ACTION. The row cannot go while this
 *              exists, and the delete is refused.
 *   CASCADES   ON DELETE CASCADE. The child is owned by this row and goes with
 *              it - a product's images, a ticket's line items. Reported so the
 *              confirmation can say what else disappears, but not a blocker.
 *   DETACHES   ON DELETE SET NULL. The child survives and forgets this row.
 *              Also reported, also not a blocker.
 */

/** Postgres spells the rule as a single character on the constraint. */
const RULE = {
  a: 'BLOCKS',      // NO ACTION
  r: 'BLOCKS',      // RESTRICT
  c: 'CASCADES',    // CASCADE
  n: 'DETACHES',    // SET NULL
  d: 'DETACHES'     // SET DEFAULT
};

/**
 * Every foreign key pointing at `table`, with the rule each one carries.
 *
 * Read from pg_constraint rather than information_schema because the delete
 * rule is only there - information_schema.referential_constraints has it, but
 * joining that back to the columns takes three more joins and answers the same
 * question less directly.
 */
async function referencesTo(table) {
  const rows = await db.raw(`
    SELECT
      child.relname   AS child_table,
      childcol.attname AS child_column,
      c.confdeltype    AS delete_rule
    FROM pg_constraint c
    JOIN pg_class      child    ON child.oid = c.conrelid
    JOIN pg_class      parent   ON parent.oid = c.confrelid
    JOIN pg_attribute  childcol ON childcol.attrelid = c.conrelid
                               AND childcol.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND parent.relname = ?
      AND parent.relnamespace = to_regnamespace(?)::oid
      AND child.relnamespace = parent.relnamespace
    ORDER BY child.relname
  `, [table, config.db.schema]);

  return rows.rows.map(function (row) {
    return {
      table: row.child_table,
      column: row.child_column,
      effect: RULE[row.delete_rule] || 'BLOCKS'
    };
  });
}

/**
 * How many rows in each referencing table actually point at this id.
 *
 * Only the ones with a count are returned - a table that references this one
 * and holds nothing for this row is not something to tell anybody about.
 */
async function dependentsOf(table, pk, id) {
  const references = await referencesTo(table);
  const found = [];

  for (let i = 0; i < references.length; i += 1) {
    const ref = references[i];

    // eslint-disable-next-line no-await-in-loop
    const row = await db(ref.table).where(ref.column, id).count({ c: '*' }).first();
    const count = Number(row.c);

    if (count > 0) found.push(Object.assign({ count: count }, ref));
  }

  return found;
}

/** Just the ones that make a permanent delete impossible. */
function blockersIn(dependents) {
  return dependents.filter(function (row) { return row.effect === 'BLOCKS'; });
}

module.exports = {
  referencesTo: referencesTo,
  dependentsOf: dependentsOf,
  blockersIn: blockersIn
};
