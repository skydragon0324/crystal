'use strict';

/**
 * THE CRM, filled from what the seeds above wrote.
 *
 * No invented CRM data: the Crystal import is run over the freshly seeded
 * members, centres, products, registrations, point logs and repair tickets,
 * exactly as it runs from the console's Overview. So a fresh install opens the
 * CRM with the customers, devices and service history the rest of the
 * console already shows - and the seed exercises the same code a deployment
 * does, through the handle it was given (a throwaway schema imports into that
 * schema).
 *
 * A database without the CRM tables - one migrated to a point before them -
 * is left alone.
 */

const crystalImport = require('../../services/crm/crystalImport.service');
const vendorImport = require('../../services/crm/vendorImport.service');
const analysisRun = require('../../services/crm/analysisRun.service');

exports.seed = async function seed(knex) {
  const built = await knex.raw("SELECT to_regclass('crm_party') AS found");
  if (!built.rows[0].found) return;

  const summary = await crystalImport.run({ db: knex });

  /*
   * Then the Eshop and the Appstore, for the members just imported - through
   * the remote services, which a development install answers from the mock -
   * and the analysis over all of it, so the CRM opens with grades.
   */
  summary.vendor = await vendorImport.run({ db: knex });
  summary.analysis = await analysisRun.run({ db: knex });

  console.log('CRM filled from Crystal: ' + Object.keys(summary).map(function (step) {
    const stepResult = summary[step];
    return step + ' ' + (stepResult.added !== undefined ? stepResult.added : (stepResult.rows !== undefined ? stepResult.rows : (stepResult.transactions !== undefined ? stepResult.transactions : stepResult.snapshots)));
  }).join(', '));
};
