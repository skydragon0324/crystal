const service = require('../services/replenishments.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');
const codes = require('../utils/codes');

function scopeOf(req) {
  /*
   * WHICHEVER CENTRE WAS ASKED FOR, and nothing narrower.
   *
   * This used to prefer the signed-in account's own centre over the query,
   * which is what pinned a branch manager to their own branch. That column
   * is gone: an account is a login and a role now, and what it may open is
   * the permission grid's answer alone.
   */
  return req.query.agency_id;
}

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await service.search({
    q: req.query.q,
    agency_id: scopeOf(req),
    status: req.query.status,
    is_auto: req.query.is_auto,
    open: flag(req.query.open),
    from: req.query.from,
    to: req.query.to,
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.id, flag(req.query.deleted)));
}

async function create(req, res) {
  const body = pick(req.body, service.COLUMNS);
  return ok(res, await service.create(body, req.actor), 'common.created');
}

/** One click: everything this centre is short of, as a draft order. */
async function fromShortages(req, res) {
  const agencyId = req.body.agency_id;
  return ok(res, await service.fromShortages(agencyId, req.actor), 'common.created');
}

async function update(req, res) {
  return ok(res, await service.update(req.params.id, pick(req.body, service.COLUMNS), req.actor), 'common.updated');
}

async function transition(req, res) {
  return ok(res, await service.transition(req.params.id, req.body.status, req.body, req.actor), 'common.updated');
}

async function addItem(req, res) {
  return ok(res, await service.addItem(req.params.id, req.body, req.actor), 'common.created');
}

async function updateItem(req, res) {
  return ok(res, await service.updateItem(req.params.id, req.params.itemId, req.body, req.actor), 'common.updated');
}

async function removeItem(req, res) {
  await service.removeItem(req.params.id, req.params.itemId, req.actor);
  return ok(res, null, 'common.deleted');
}

async function remove(req, res) {
  await service.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

async function meta(req, res) {
  return ok(res, { status: codes.REPLENISHMENT_STATUS });
}

module.exports = {
  list: list,
  detail: detail,
  create: create,
  fromShortages: fromShortages,
  update: update,
  transition: transition,
  addItem: addItem,
  updateItem: updateItem,
  removeItem: removeItem,
  remove: remove,
  meta: meta
};
