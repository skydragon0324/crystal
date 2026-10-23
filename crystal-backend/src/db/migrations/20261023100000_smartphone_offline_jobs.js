/**
 * Delta 069, as a migration: linking customers to SMARTPHONE_OFFLINE as a job
 * that keeps its progress (sql/deltas/069_smartphone_offline_jobs.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '069_smartphone_offline_jobs.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS crm_smartphone_offline_job_failure; DROP TABLE IF EXISTS crm_smartphone_offline_job;');
};
