const fs = require('fs');
const path = require('path');
exports.up = async function (knex) {
 if (await knex.schema.hasTable('crm_registration_intake')) return;
 await knex.raw(fs.readFileSync(path.join(__dirname, '../../../sql/deltas/043_phase1_identity_intake.sql'), 'utf8'));
};
exports.down = async function () { throw new Error('Phase 1 identity migration requires a backup restore to reverse.'); };
