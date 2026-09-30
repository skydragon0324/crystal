const service = require('../services/permissions.service');
const repo = require('../repositories/permissions.repository');
const { ok } = require('../utils/response');

/** The whole page tree with one role's level on each - the permission grid. */
async function matrix(req, res) {
  return ok(res, await service.matrixOf(req.params.roleId));
}

async function save(req, res) {
  return ok(res, await service.saveMatrix(req.params.roleId, req.body.entries, req.actor), 'common.updated');
}

/** The registered pages, for the sidebar editor and the role form. */
async function pages(req, res) {
  return ok(res, await repo.menuPages());
}

async function levels(req, res) {
  return ok(res, { levels: service.LEVEL, names: service.LEVEL_NAMES });
}

module.exports = { matrix: matrix, save: save, pages: pages, levels: levels };
