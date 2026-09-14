const repo = require('../repositories/permissions.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/management/permissions';

/**
 * What a role may do, as a question about the business rather than about a
 * request.
 *
 * The HTTP guard is middleware/permission.js and does nothing but ask this.
 * Keeping the two apart is what lets anything else ask the same question -
 * the sidebar the console draws, the notification bell deciding whether to
 * count tickets this user cannot open - without going through express.
 */

const LEVEL = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  SUPER: 3
};

const LEVEL_NAMES = { 0: 'None', 1: 'Read', 2: 'Write', 3: 'Super' };

/** The page tree with this role's level on each, for the permission grid. */
function matrixOf(roleId) {
  return repo.matrixOf(roleId);
}

/** The pages one administrator may actually open, for the sidebar. */
function grantsOf(roleId) {
  return repo.grantsOf(roleId);
}

/**
 * Saves a whole grid.
 *
 * One transaction, because a half saved permission grid is a role that can
 * write one screen and not read the next - and the person who saved it has no
 * way of knowing which half took.
 *
 * The trail gets one entry for the role rather than one per page: an
 * administrator ticking eleven boxes and pressing save did one thing.
 */
async function saveMatrix(roleId, entries, actor) {
  const role = await repo.findRole(roleId);
  if (!role) throw new HttpError(404, 'common.notFound');

  const wanted = (entries || []).filter(function (entry) {
    return entry && entry.page_id !== undefined && entry.permission !== undefined;
  });

  if (!wanted.length) throw new HttpError(400, 'common.nothingToUpdate');

  const invalid = wanted.filter(function (entry) {
    const level = Number(entry.permission);
    return !(level >= LEVEL.NONE && level <= LEVEL.SUPER);
  });
  if (invalid.length) throw new HttpError(400, 'common.valueFailedAValidation');

  const before = await repo.rowsOf(roleId);

  await transaction(async function (trx) {
    for (let i = 0; i < wanted.length; i += 1) {
      // Sequential on purpose: they all touch one role, and issuing a dozen
      // upserts in parallel on one transaction is a deadlock looking for a
      // busy afternoon.
      // eslint-disable-next-line no-await-in-loop
      await repo.setLevel(roleId, Number(wanted[i].page_id), Number(wanted[i].permission), trx);
    }
  });

  const after = await repo.rowsOf(roleId);

  audit.updated(actor, repo.PERMS, roleId,
    { role_id: roleId, grants: summarise(before) },
    { role_id: roleId, grants: summarise(after) },
    PAGE);

  return { role_id: roleId, saved: wanted.length };
}

/** The grid as one comparable value, so the trail records what actually moved. */
function summarise(rows) {
  const out = {};
  rows.forEach(function (row) { out[row.page_id] = row.permission; });
  return JSON.stringify(out);
}

module.exports = {
  PAGE: PAGE,
  LEVEL: LEVEL,
  LEVEL_NAMES: LEVEL_NAMES,
  matrixOf: matrixOf,
  grantsOf: grantsOf,
  saveMatrix: saveMatrix
};
