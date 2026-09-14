const service = require('../services/technicians.service');
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

  const result = await service.search({
    q: req.query.q,
    agency_id: scopeOf(req),
    status: req.query.status,
    grade: req.query.grade,
    component: req.query.component,
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

async function options(req, res) {
  return ok(res, await service.options(scopeOf(req)));
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.id, flag(req.query.deleted)));
}

async function create(req, res) {
  const body = pick(req.body, service.COLUMNS);
  body.skills = req.body.skills;
  return ok(res, await service.create(body, req.actor), 'common.created');
}

async function update(req, res) {
  const body = pick(req.body, service.COLUMNS);
  body.skills = req.body.skills;
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
  return ok(res, { grades: codes.TECHNICIAN_GRADE, components: codes.COMPONENTS });
}

module.exports = {
  list: list, options: options, detail: detail,
  create: create, update: update, remove: remove, restore: restore, meta: meta
};
