'use strict';

/**
 * DEMO DATA FOR EVERY CRM SCREEN, after the imports in 09_crm.
 *
 * The imports bring what the projects know; scripts/demo-crm.js adds what the
 * CRM itself is for - organizations, consents, classified cases, programs,
 * segments, campaigns and their results, events and targets - through the
 * same API the console uses. See that file for what is added and why.
 *
 * Never in production: this is test data with invented names.
 */

const demo = require('../../../scripts/demo-crm');

exports.seed = async function seed(knex) {
  if (process.env.NODE_ENV === 'production') return;
  const built = await knex.raw("SELECT to_regclass('crm_party') AS found");
  if (!built.rows[0].found) return;
  await demo.run();
};
