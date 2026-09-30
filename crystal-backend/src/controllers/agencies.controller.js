const service = require('../services/agencies.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');
const codes = require('../utils/codes');

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);

  const result = await service.search({
    q: req.query.q,
    province: req.query.province,
    status: req.query.status,
    tier: req.query.tier,
    // The console lists one section at a time: smartphone centres and
    // eproduct centres are two screens run by two different people.
    section: req.query.section,
    service_type: req.query.service_type,
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

async function options(req, res) {
  return ok(res, await service.options(false));
}

/*
 * `?all=1` is the FORM's list: every province a centre may be filed under,
 * in the configured order, including the ones with no centre yet. Without it,
 * the provinces that have live centres - what the health board filters by.
 */
async function provinces(req, res) {
  if (flag(req.query.all)) return ok(res, await service.provinceOptions());
  return ok(res, await service.provinces({ section: req.query.section }));
}

async function detail(req, res) {
  // A section page asks for its own service list; the overview asks for both.
  return ok(res, await service.detail(req.params.id, flag(req.query.deleted), req.query.section));
}

async function create(req, res) {
  const body = pick(req.body, service.COLUMNS);
  /*
   * "services" and "section" travel together, and neither is a column.
   *
   * The section says WHICH list the services replace - the other section is
   * left alone, because somebody else maintains it - so sending one without
   * the other is refused rather than guessed at.
   */
  body.services = req.body.services;
  body.section = req.body.section;
  /*
   * `phones` is not a column either: it is the centre's whole list of
   * numbers, replaced as one. Absent means "leave them as they are".
   */
  body.phones = req.body.phones;
  return ok(res, await service.create(body, req.actor), 'common.created');
}

async function update(req, res) {
  const body = pick(req.body, service.COLUMNS);
  body.services = req.body.services;
  body.section = req.body.section;
  body.phones = req.body.phones;
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
  return ok(res, { tiers: codes.AGENCY_TIER });
}

module.exports = {
  list: list, options: options, provinces: provinces, detail: detail,
  create: create, update: update, remove: remove, restore: restore, meta: meta
};
