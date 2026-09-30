'use strict';

/**
 * SIGNS WHAT THE SEEDS WROTE, so a freshly seeded site is a verifiable one.
 *
 * Every seed above inserts notices and FAQs straight through knex, which is
 * what a seed should do - and none of them is a write path the signing hooks
 * see. Without this the storefront, which refuses to render signed content
 * that does not verify, would open on a fresh install with no notices at all
 * and every answer showing "could not be verified". So the last seed runs the
 * backfill over what the others created, through the handle it was given - a
 * seed run against a throwaway schema (`npm run migrate:verify`) signs into
 * that schema.
 *
 * Images already on disk are signed too, if they have no signature. Files the
 * seeds merely REFERENCE are drawn afterwards by `npm run mock:images`, which
 * signs each one it writes.
 *
 * It needs the signing key. With none, it fails with the sentence that says
 * to run `npm run content-keys` - the same one the API refuses to start with.
 */

const maintenance = require('../../security/maintenance');

exports.seed = async function seed(knex) {
  const result = await maintenance.backfill({ db: knex, types: ['notification', 'faq', 'image'] });

  const counts = {};
  result.signed.forEach(function (finding) { counts[finding.type] = (counts[finding.type] || 0) + 1; });

  console.log('signed ' + result.signed.length + ' seeded item(s): ' +
    (Object.keys(counts).map(function (type) { return counts[type] + ' ' + type; }).join(', ') || 'none needed'));

  /*
   * A MISSING file here is normal on a fresh install: the seeds reference
   * pictures that `npm run mock:images` draws next, and it signs each one as it
   * writes it. Anything INVALID is not normal, and the audit will say so.
   */
  if (result.skipped.length) {
    console.log('  not signed: ' + result.skipped.slice(0, 10).map(function (finding) {
      return finding.type + ' ' + finding.ref + ' (' + finding.status + ')';
    }).join(', ') + (result.skipped.length > 10 ? ' and ' + (result.skipped.length - 10) + ' more' : '') +
      ' - a missing file is drawn and signed by `npm run mock:images`');
  }
};
