const service = require('../services/claims.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');
const { HttpError } = require('../utils/response');
const { LEVEL } = require('../services/permissions.service');
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
    month: req.query.month,
    from: req.query.from,
    to: req.query.to,
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.id, flag(req.query.deleted)));
}

/** What next month's claim would contain, before anybody commits to it. */
async function preview(req, res) {
  const agencyId = scopeOf(req) || req.query.agency_id;
  return ok(res, await service.preview(agencyId, req.query.month));
}

async function build(req, res) {
  const agencyId = req.body.agency_id;
  return ok(res, await service.build(agencyId, req.body.month, req.actor), 'common.created');
}

/**
 * Moving a claim along, at one of two permission levels.
 *
 * Submitting and cancelling are the claiming centre's own business.  Approving,
 * rejecting and marking paid are head office deciding what it owes, and a
 * centre that could approve its own claims would be writing itself cheques -
 * so those three need SUPER on this page and the rest need WRITE.
 *
 * requirePermission put the granted level on the request; this is the only
 * place that reads it, because it is the only endpoint where the answer
 * depends on the body rather than on the route.
 */
const HEAD_OFFICE_ONLY = [service.STATUS.APPROVED, service.STATUS.REJECTED, service.STATUS.PAID];

async function transition(req, res) {
  const next = Number(req.body.status);

  if (HEAD_OFFICE_ONLY.indexOf(next) !== -1 && req.permission < LEVEL.SUPER) {
    throw new HttpError(403, 'common.permissionDenied');
  }

  return ok(res, await service.transition(req.params.id, next, req.body, req.actor), 'common.updated');
}

async function update(req, res) {
  return ok(res, await service.update(req.params.id, pick(req.body, service.COLUMNS), req.actor), 'common.updated');
}

async function remove(req, res) {
  await service.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

async function meta(req, res) {
  return ok(res, { status: codes.CLAIM_STATUS });
}

module.exports = {
  list: list,
  detail: detail,
  preview: preview,
  build: build,
  transition: transition,
  update: update,
  remove: remove,
  meta: meta
};
