const db = require('../../config/db');

/**
 * THE PROJECTS THAT PLAY A PART IN CUSTOMER IDENTITY, found by the role an
 * administrator gives them in Settings > Projects - never by project code:
 *
 *   ESHOP            the e-shop (the Excel import's E-shop PK / ID columns)
 *   USER_MANAGEMENT  the user management system (the Excel import's User PK /
 *                    User ID columns; the same user_pk is the same person)
 *
 * At most one project has each role; null when none has been given it yet.
 */
const ROLES = ['ESHOP', 'USER_MANAGEMENT'];

async function byRole(role, trx) {
  return (trx || db)('crm_project').where('identity_role', role).first('project_id', 'project_code', 'project_name', 'status');
}

module.exports = { ROLES: ROLES, byRole: byRole };
