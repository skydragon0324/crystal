const knex = require('knex');
const config = require('./index');

/**
 * THE LEGACY DATABASE: feedback and the blog, which are not Crystal's to own.
 *
 * Both of those live in the vendor's Oracle instance and are read and written
 * there, by this application and by the vendor's own console at the same
 * time. Crystal does not migrate them, does not own their shape, and must not
 * alter it - see sql/legacy/README.md.
 *
 * ONE HANDLE, TWO DRIVERS, and the same query code on both:
 *
 *   deploy       LEGACY_DRIVER=oracle    a real oracledb pool
 *   development  LEGACY_DRIVER=postgres  the same PostgreSQL server Crystal
 *                                        already uses, where sql/legacy/
 *                                        creates ora_pid and ora_blog as
 *                                        ordinary schemas
 *
 * That works because EVERY table name in repositories/legacy/ is written
 * schema-qualified - `ora_pid.feedback_threads`, never `feedback_threads`.
 * Oracle resolves that to a schema owned by another user; PostgreSQL resolves
 * it to a schema in the same database. Neither needs to know about the other,
 * and no query has to be written twice. It is the pattern vendor_backend uses
 * to run the same models against both (see its db/knex.js and db/knex_oracle.js).
 *
 * WHY THE DEVELOPMENT DRIVER IS ITS OWN POOL rather than the handle in
 * config/db.js, which would connect to the identical database with the
 * identical credentials:
 *
 *   because in production these ARE two databases, and code written against
 *   one shared handle will not say so. A `db.transaction()` wrapping a
 *   Crystal write and a feedback write is correct on one pool and impossible
 *   across two, and sharing the pool in development means the first time
 *   anybody finds out is in production. Two handles make the boundary real on
 *   the machine where it is cheap to discover.
 *
 * Nothing else in the codebase may require this file: repositories/legacy/
 * imports it, and that is the whole list.
 */

let instance = null;

/** Uppercase going in, lowercase coming out - Oracle folds unquoted names up. */
function oracleSettings() {
  return {
    client: 'oracledb',
    connection: {
      user: config.legacy.user,
      password: config.legacy.password,
      connectString: config.legacy.connectString
    },
    pool: { min: config.legacy.poolMin, max: config.legacy.poolMax },

    /*
     * Knex quotes identifiers, and a quoted "feedback_threads" in Oracle is a
     * DIFFERENT object from the FEEDBACK_THREADS the DDL created. Folding to
     * upper case here is what lets the repositories be written in the lower
     * case the rest of the codebase uses.
     */
    wrapIdentifier: function (value, origImpl) {
      return origImpl(String(value).toUpperCase());
    },

    /* And the rows come back SHOUTING, so they are folded back down. */
    postProcessResponse: lowerCaseKeys,

    /* Crystal owns no Oracle schema; no migration bookkeeping belongs there. */
    migrations: { disableMigrationsListValidation: true }
  };
}

/**
 * The development stand-in: PostgreSQL, same server, same credentials.
 *
 * `search_path` names only the two legacy schemas. Crystal's own schema is
 * deliberately NOT on it, so a table name that lost its qualifier reads an
 * empty table rather than quietly finding crystal_v1.feedback_threads and
 * looking like it worked.
 */
function postgresSettings() {
  const searchPath = [config.legacy.pidSchema, config.legacy.blogSchema];

  return {
    client: 'pg',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database
    },
    searchPath: searchPath,
    pool: {
      min: config.legacy.poolMin,
      max: config.legacy.poolMax,
      afterCreate: function (conn, done) {
        const sql = 'SET search_path TO "' + searchPath.join('", "') + '"; ' +
          "SET timezone TO 'UTC'";
        conn.query(sql, function (err) { done(err, conn); });
      }
    },
    postProcessResponse: lowerCaseKeys
  };
}

function lowerCaseKeys(result) {
  const one = function (row) {
    if (row === null || typeof row !== 'object' || row instanceof Date) return row;
    const out = {};
    Object.keys(row).forEach(function (key) { out[key.toLowerCase()] = row[key]; });
    return out;
  };

  return Array.isArray(result) ? result.map(one) : one(result);
}

/**
 * The handle. Built once, on first use.
 *
 * There is no null return and no fallback here, unlike config/oracle.js: the
 * serial lookup has a local mirror to degrade to, and feedback does not. A
 * member's conversation with support cannot be served from somewhere else, so
 * an unreachable legacy database is a 503 and says so, rather than an empty
 * inbox that reads like "you have never written to us".
 */
function connection() {
  if (instance) return instance;

  if (config.legacy.driver === 'oracle' && config.legacy.libDir) {
    /* The thick client has to be initialised before the first connection. */
    require('oracledb').initOracleClient({ libDir: config.legacy.libDir });
  }

  instance = knex(config.legacy.driver === 'oracle' ? oracleSettings() : postgresSettings());
  return instance;
}

/** Schema-qualified table names, so a repository never spells one out. */
function pid(table) {
  return config.legacy.pidSchema + '.' + table;
}

function blog(table) {
  return config.legacy.blogSchema + '.' + table;
}

/* The three satellites - see config/index.js for what they are. */
function license(table) {
  return config.legacy.licenseSchema + '.' + table;
}

function media(table) {
  return config.legacy.mediaSchema + '.' + table;
}

function old(table) {
  return config.legacy.oldSchema + '.' + table;
}

/**
 * `SELECT 1`, which is not portable.
 *
 * Oracle has no FROM-less select and PostgreSQL has no DUAL, so the one
 * statement every driver-neutral file needs is the one that cannot be shared.
 */
function ping() {
  return config.legacy.driver === 'oracle'
    ? connection().raw('SELECT 1 FROM DUAL')
    : connection().raw('SELECT 1');
}

/**
 * THE NEXT VALUE OF A SEQUENCE, which is the other thing that is not portable.
 *
 * ora_blog.blog_article has no identity, no default and no insert trigger -
 * the vendor allocates the id in the application - so a new article has to ask
 * for one. Oracle spells that `seq.NEXTVAL FROM DUAL` and PostgreSQL spells it
 * `nextval(name)`; there is no third spelling both accept.
 *
 * The FEEDBACK tables need none of this: Oracle fills their keys from a BEFORE
 * INSERT trigger and the stand-in gives the column that sequence as a DEFAULT,
 * so an insert that omits the key is correct on both drivers.
 */
async function nextValue(sequence) {
  const oracle = config.legacy.driver === 'oracle';

  const result = await connection().raw(
    oracle ? 'SELECT ' + sequence + '.NEXTVAL AS id FROM DUAL' : 'SELECT nextval(?) AS id',
    oracle ? [] : [sequence]
  );

  /* knex hands a raw select back wrapped on pg and bare on oracledb. */
  const rows = result.rows || result;
  return Number(rows[0].id);
}

/** Liveness, for /health. */
async function state() {
  try {
    await ping();
    return 'up';
  } catch (err) {
    return 'down';
  }
}

async function disconnect() {
  if (!instance) return;
  try {
    await instance.destroy();
  } catch (err) {
    /* shutting down anyway */
  }
  instance = null;
}

module.exports = {
  connection: connection,
  pid: pid,
  blog: blog,
  license: license,
  media: media,
  old: old,
  nextValue: nextValue,
  state: state,
  disconnect: disconnect,
  driver: function () { return config.legacy.driver; }
};
