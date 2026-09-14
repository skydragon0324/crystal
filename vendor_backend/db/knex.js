const knex = require('knex');
const pg = require('pg');

/* ------------------------------------------------------------------
 * pg type parsers  --  MUST come before the pool is created.
 *
 * node-oracledb returned NUMBER columns as JS numbers. node-postgres
 * returns BIGINT (int8) and NUMERIC as *strings* to avoid precision
 * loss. Without these parsers every `row.user_pk === 1` comparison in
 * the controllers silently becomes false, and every arithmetic op
 * turns into string concatenation.
 *
 * If you have IDs or money columns that can exceed 2^53, remove the
 * int8/numeric parsers and handle those columns as strings instead.
 * ------------------------------------------------------------------ */
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : parseInt(v, 10)));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));

// DATE (no time part) -> keep the plain 'YYYY-MM-DD' string rather than
// letting pg build a Date at local midnight, which shifts the day for
// anyone east or west of UTC.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

const toLowerCase = (str) => str.toLowerCase();

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Oracle's DB_CONNECT_STRING has no equivalent; use host/port/database.
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },

  // Postgres resolves unquoted identifiers to lower case, and the converted
  // schema is created in lower case, so search_path just needs to point at it.
  searchPath: [process.env.DB_SCHEMA || 'public'],

  pool: {
    min: 2,
    // Oracle happily took 600. Postgres spawns one backend *process* per
    // connection and defaults to max_connections = 100, so 600 will refuse
    // connections outright. Keep this at (max_connections - reserved) split
    // across your app instances, and put PgBouncer in front if you need more.
    max: Number(process.env.DB_POOL_MAX) || 20,
    acquireTimeoutMillis: 2 * 60 * 1000,
    idleTimeoutMillis: 30 * 1000,
    propagateCreateError: false,
  },

  /* NOTE: the Oracle build had
   *
   *   wrapIdentifier: (value, origImpl) => origImpl(value.toUpperCase())
   *
   * That MUST NOT be carried over. Knex's pg dialect wraps identifiers in
   * double quotes, and a quoted "USERS" in Postgres is a different object
   * from the users table the schema actually creates. Leaving it in gives
   * `relation "USERS" does not exist` on the very first query.
   */

  // Postgres already returns lower-case column names, so this is a no-op in
  // the normal path. It is kept so that any hand-written `AS "SomeAlias"`
  // still reaches the controllers in the shape they expect.
  postProcessResponse: (result) => {
    const lower = (row) => {
      if (row === null || typeof row !== 'object' || row instanceof Date) return row;
      const out = {};
      for (const key in row) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
          out[toLowerCase(key)] = row[key];
        }
      }
      return out;
    };
    if (Array.isArray(result)) return result.map(lower);
    return lower(result);
  },
});

module.exports = db;
