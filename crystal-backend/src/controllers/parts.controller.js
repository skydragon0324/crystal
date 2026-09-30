const service = require('../services/parts.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');
const codes = require('../utils/codes');

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);

  const result = await service.search({
    q: req.query.q,
    component: req.query.component,
    status: req.query.status,
    product_id: req.query.product_id,
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

async function options(req, res) {
  return ok(res, await service.options(false));
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.id, flag(req.query.deleted)));
}

/**
 * `product_ids` rides alongside the columns rather than through pick(): it is
 * not a column on the row, it is the whole compatibility table for this part,
 * replaced as one value.
 */
async function create(req, res) {
  const body = pick(req.body, service.COLUMNS);
  body.product_ids = req.body.product_ids;
  return ok(res, await service.create(body, req.actor), 'common.created');
}

async function update(req, res) {
  const body = pick(req.body, service.COLUMNS);
  body.product_ids = req.body.product_ids;
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

async function meta(req, res) {
  return ok(res, { components: codes.COMPONENTS });
}

module.exports = {
  list: list, options: options, detail: detail,
  create: create, update: update, remove: remove, restore: restore, meta: meta
};
