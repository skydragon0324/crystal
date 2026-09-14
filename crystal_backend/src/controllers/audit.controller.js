const service = require('../services/audit.service');
const { ok, page } = require('../utils/response');
const { readPaging } = require('../utils/query');

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await service.search({
    q: req.query.q,
    entity: req.query.entity,
    entity_pk: req.query.entity_pk,
    action: req.query.action,
    manager_id: req.query.manager_id,
    from: req.query.from,
    to: req.query.to
  }, paging);

  return page(res, result, paging);
}

/** The dropdown contents, read off the trail rather than off the tables. */
async function filters(req, res) {
  return ok(res, await service.filters());
}

/**
 * One record's whole history.
 *
 * Reached from the record's own screen rather than from the audit page, which
 * is why it takes an entity and a key instead of a filter - "what has happened
 * to THIS ticket" is a different question from "what happened yesterday".
 */
async function history(req, res) {
  return ok(res, await service.historyOf(req.params.entity, req.params.entityPk));
}

module.exports = { list: list, filters: filters, history: history };
