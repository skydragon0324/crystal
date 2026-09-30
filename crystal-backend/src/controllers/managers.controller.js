const service = require('../services/managers.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);

  const result = await service.search({
    q: req.query.q,
    role_id: req.query.role_id,
    agency_id: req.query.agency_id,
    status: req.query.status,
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.id, flag(req.query.deleted)));
}

/** The password is not a column, so it rides alongside pick()'s result. */
async function create(req, res) {
  const body = pick(req.body, service.COLUMNS);
  body.password = req.body.password;
  return ok(res, await service.create(body, req.actor), 'common.created');
}

async function update(req, res) {
  const body = pick(req.body, service.COLUMNS);
  if (req.body.password) body.password = req.body.password;
  return ok(res, await service.update(req.params.id, body, req.actor), 'common.updated');
}

async function remove(req, res) {
  await service.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

async function restore(req, res) {
  await service.restore(req.params.id, req.actor);
  return ok(res, null, 'common.restored');
}

module.exports = { list: list, detail: detail, create: create, update: update, remove: remove, restore: restore };
