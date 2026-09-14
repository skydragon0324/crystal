const knex = require('knex');
const config = require('./index');

/**
 * The vendor's legacy warehouse (spec 2), which Crystal reads and never
 * writes.  Serial numbers live there; everything else lives in PostgreSQL.
 *
 * Built LAZILY, and only when ORACLE_ENABLED is true.  Constructing it at
 * boot would make a missing instant client - or a warehouse that is simply
 * down - fail the whole API, and the platform is designed to run with Oracle
 * switched off: the serial lookup falls back to the local `oracle_serials`
 * mirror, so a warehouse outage degrades rather than stopping a member
 * registering a device they physically hold.
 *
 * Every failure here is answered with null rather than a throw, because the
 * caller's fallback is the correct behaviour and not an error path.
 */

let instance = null;
let failed = false;

function settings() {
  return {
    client: 'oracledb',
    connection: {
      user: config.oracle.user,
      password: config.oracle.password,
      connectString: config.oracle.connectString
    },
    pool: { min: config.oracle.poolMin, max: config.oracle.poolMax },
    // Crystal owns no Oracle schema; no migration bookkeeping belongs there.
    migrations: { disableMigrationsListValidation: true }
  };
}

/** The knex instance, or null when Oracle is off, missing or broken. */
function connection() {
  if (!config.oracle.enabled || failed) return null;
  if (instance) return instance;

  try {
    if (config.oracle.libDir) {
      // The thick client has to be initialised before the first connection.
      require('oracledb').initOracleClient({ libDir: config.oracle.libDir });
    }
    instance = knex(settings());
    return instance;
  } catch (err) {
    failed = true;
    console.warn('[oracle] unavailable, the local serial mirror will be used - ' + err.message);
    return null;
  }
}

/**
 * Liveness, for /health.
 *
 * 'disabled' rather than 'down' when it is switched off: the platform is
 * designed to run that way, and nobody should be paged for a configuration.
 */
async function state() {
  if (!config.oracle.enabled) return 'disabled';

  const db = connection();
  if (!db) return 'down';

  try {
    await db.raw('SELECT 1 FROM DUAL');
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
  state: state,
  disconnect: disconnect
};
