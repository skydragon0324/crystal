'use strict';

/**
 * DEMO DATA FOR THE CRM: its projects, sites, catalogue, customers, purchases,
 * repairs and points (scripts/demo-crm-base.js). Seed 10_crm_demo builds the
 * rest - organizations, consents, events, campaigns - on top of it.
 *
 * Never in production: a real install starts with no projects, and an
 * administrator adds them in Settings > Projects. A database without the CRM
 * tables - one migrated to a point before them - is left alone.
 */

const base = require('../../../scripts/demo-crm-base');

exports.seed = async function seed(knex) {
  if (process.env.NODE_ENV === 'production') return;
  const built = await knex.raw("SELECT to_regclass('crm_party') AS found");
  if (!built.rows[0].found) return;

  const summary = await base.run();
  console.log('CRM demo base: ' + Object.keys(summary).map(function (step) {
    const value = summary[step];
    return step + ' ' + (value && typeof value === 'object' ? (value.snapshots !== undefined ? value.snapshots : (value.rows !== undefined ? value.rows : JSON.stringify(value))) : value);
  }).join(', '));
};
