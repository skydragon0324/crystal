/**
 * Delta 054 - the customer lifecycle analytics read models
 * (sql/deltas/054_customer_lifecycle.sql).
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 *
 * `down` drops in dependency order - current references profile, and both
 * event and job_run reference managers. Dropping these loses no source data:
 * every row is derived from Oracle plus the login journal, and the journal
 * itself is rebuildable by a full reconciliation. What IS lost is the
 * checkpoints, the run history and the business-event definitions, which is
 * why requirement 13 asks for them to be preserved across a rollback that is
 * not meant to discard them.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '054_customer_lifecycle.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS lifecycle_exception;
    DROP TABLE IF EXISTS lifecycle_job_run;
    DROP TABLE IF EXISTS lifecycle_sync_checkpoint;
    DROP TABLE IF EXISTS lifecycle_business_event;
    DROP TABLE IF EXISTS lifecycle_kpi_daily;
    DROP TABLE IF EXISTS lifecycle_customer_period;
    DROP TABLE IF EXISTS lifecycle_customer_current;
    DROP TABLE IF EXISTS lifecycle_login_event;
    DROP TABLE IF EXISTS lifecycle_customer_profile;
  `);
};
