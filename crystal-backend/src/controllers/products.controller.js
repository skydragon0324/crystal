const service = require('../services/products.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);

  const result = await service.search({
    q: req.query.q,
    category_id: req.query.category_id,
    series_id: req.query.series_id,
    status: req.query.status,
    is_featured: req.query.is_featured,
    /*
     * From the PAGE that was authorised, never from the query string.
     * Reading it back off req.query here would let a request pass the
     * permission check as one section and then list the other.
     */
    category_types: req.sectionTypes,
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

async function create(req, res) {
  return ok(res, await service.create(pick(req.body, service.COLUMNS), req.actor), 'common.created');
}

async function update(req, res) {
  return ok(res, await service.update(req.params.id, pick(req.body, service.COLUMNS), req.actor), 'common.updated');
}

async function remove(req, res) {
  await service.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

async function restore(req, res) {
  await service.restore(req.params.id, req.actor);
  return ok(res, null, 'common.restored');
}

async function saveSpecifications(req, res) {
  return ok(res, await service.saveSpecifications(req.params.id, req.body.entries, req.actor), 'common.updated');
}

/*
 * The finishes and the box arrive as WHOLE lists, like the specification
 * sheet above - the editor is looking at an ordered table, and a per-row
 * endpoint would make reordering four rows four requests that can half fail.
 */
async function saveColors(req, res) {
  return ok(res, await service.saveColors(req.params.id, req.body.entries, req.actor), 'common.updated');
}

async function saveAccessories(req, res) {
  return ok(res, await service.saveAccessories(req.params.id, req.body.entries, req.actor), 'common.updated');
}

async function addOsHistory(req, res) {
  return ok(res, await service.saveOsHistory(req.params.id, req.body, req.actor), 'common.created');
}

async function saveOsHistory(req, res) {
  const entry = Object.assign({}, req.body, { id: req.params.historyId });
  return ok(res, await service.saveOsHistory(req.params.id, entry, req.actor), 'common.updated');
}

async function removeOsHistory(req, res) {
  await service.removeOsHistory(req.params.id, req.params.historyId, req.actor);
  return ok(res, null, 'common.deleted');
}

module.exports = {
  list: list, options: options, detail: detail,
  create: create, update: update, remove: remove, restore: restore,
  saveSpecifications: saveSpecifications,
  saveColors: saveColors,
  saveAccessories: saveAccessories,
  addOsHistory: addOsHistory, saveOsHistory: saveOsHistory, removeOsHistory: removeOsHistory
};
