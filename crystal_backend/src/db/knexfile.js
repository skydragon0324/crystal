const path = require('path');
const pg = require('pg');
const config = require('../config');

/**
 * node-postgres turns a `date` column into a JS Date at local midnight, which
 * JSON.stringify then writes out in UTC - so a warranty ending 2026-01-15
 * leaves the server as "2026-01-14T16:00:00.000Z" for anyone east of UTC, and
 * the customer is told their cover ran out a day early.  A plain date has no
 * time and no zone, so it is handed over as the 'YYYY-MM-DD' text Postgres
 * already produced.
 *
 * It is set HERE rather than beside the connection because the knex CLI reads
 * this file and nothing else: a parser installed in config/db.js applies to
 * the running API and not to migrations or seeds, and a seed comparing a Date
 * object against a 'YYYY-MM-DD' string gets false every time - silently, and
 * for every row.
 *
 * 1082 is the OID of `date`.  Timestamps keep their normal parsing, because
 * those genuinely are points in time.
 */
pg.types.setTypeParser(1082, function (value) { return value; });

/**
 * Knex's configuration, next to the migrations and seeds it points at rather
 * than at the top of the project - the three only ever change together.
 *
 * Every path here is absolute, because nothing in this file can assume where
 * it is being run from: the knex CLI changes the working directory to
 * whichever folder the knexfile is in before it reads anything, so a relative
 * migrations directory finds no migrations, quietly.
 *
 * `searchPath` and `migrations.schemaName` both name Crystal's own schema.
 * Without the second one the CLI writes its bookkeeping table to `public`,
 * and two projects sharing a database end up fighting over one ledger.
 */
const base = {
  client: 'pg',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  },
  searchPath: [config.db.schema, 'public'],
  pool: {
    min: config.db.poolMin,
    max: config.db.poolMax,
    /*
     * knex 0.21 opens connections lazily, and `searchPath` above only applies
     * to the query builder.  Setting it on the connection itself is what makes
     * a raw query - including the whole of schema.sql - land in Crystal's
     * schema rather than in public.
     */
    afterCreate: function (conn, done) {
      /*
       * Two settings, and the second one matters more than it looks.
       *
       * A date in this codebase is a 'YYYY-MM-DD' string produced by
       * toISOString(), which is UTC.  PostgreSQL evaluates CURRENT_DATE and
       * `received_at::date` in the SERVER's timezone, and a server in
       * America/Los_Angeles thinks it is still yesterday for the first
       * sixteen hours of every UTC day.
       *
       * The two then disagree about what day it is - which is not a rounding
       * error but a whole day, and it lands on exactly the comparisons that
       * decide whether a repair was inside its warranty.  Pinning the
       * connection to UTC makes the database and the application agree, and
       * doing it here means migrations, seeds and the running API all get it
       * rather than only whichever of them somebody remembered.
       */
      const sql = 'SET search_path TO "' + config.db.schema + '", public; ' +
        "SET timezone TO 'UTC'";
      conn.query(sql, function (err) { done(err, conn); });
    }
  },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
    schemaName: config.db.schema
  },
  seeds: { directory: path.join(__dirname, 'seeds') }
};

module.exports = {
  development: base,
  production: Object.assign({}, base, { pool: Object.assign({}, base.pool, { max: 20 }) })
};
