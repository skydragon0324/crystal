const service = require('../services/blog.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await service.search({
    q: req.query.q,
    category: req.query.category,
    status: req.query.status,
    author_id: req.query.author_id,
    /* ARTICLE (the default), REPLY or ALL - members submit replies for approval too. */
    kind: req.query.kind ? String(req.query.kind).toUpperCase() : undefined,
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.id, flag(req.query.deleted)));
}

async function create(req, res) {
  return ok(res, await service.create(pick(req.body, service.COLUMNS), req.admin, req.actor), 'common.created');
}

async function update(req, res) {
  return ok(res, await service.update(req.params.id, pick(req.body, service.COLUMNS), req.actor), 'common.updated');
}

/**
 * Moving an article through the workflow.
 *
 * Separate from editing because the permission grid answers "who may write"
 * and "who may put this in front of customers" differently - see the route
 * file, where publishing sits a level higher.
 */
async function transition(req, res) {
  return ok(res, await service.transition(req.params.id, String(req.body.status).toUpperCase(), req.actor), 'common.updated');
}

async function remove(req, res) {
  await service.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

async function restore(req, res) {
  await service.restore(req.params.id, req.actor);
  return ok(res, null, 'common.restored');
}

/** What a permanent delete would take with it - see the route file. */
async function dependents(req, res) {
  return ok(res, await service.dependents(req.params.id));
}

async function purge(req, res) {
  await service.purge(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

module.exports = {
  list: list, detail: detail, create: create, update: update,
  transition: transition, remove: remove, restore: restore,
  dependents: dependents, purge: purge
};
