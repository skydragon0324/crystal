const createCrudService = require('../services/crud.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');

/**
 * The HTTP half of the generic CRUD stack: query string in, JSON out.
 *
 * Everything here is translation.  `?deleted=1` becomes a boolean, `?page=`
 * and `?sort=` become a paging object, and the body is narrowed to the
 * columns this table actually accepts - so a request that names a column it
 * has no business writing simply does not carry one.
 *
 * `extras` is the second, much smaller, allow-list: body keys that are NOT
 * columns of this table and are handed to the table's `afterSave` instead of
 * being written.  It exists for the one thing a plain master table cannot
 * express - a child list edited inside the same form - and it is an
 * allow-list for the same reason `columns` is.
 */
module.exports = function createCrudController(opts) {
  const service = createCrudService(opts);
  const columns = opts.columns;
  const extras = opts.extras || [];

  /*
   * COLUMNS A LIST MAY BE NARROWED BY, from the query string.
   *
   * An allow-list for the same reason `columns` is: without one, `?kind=x`
   * would either be ignored - leaving a screen that cannot filter - or
   * accepted for any column named, which is a query string choosing what to
   * scan. A table that declares none is unaffected.
   */
  const filterable = opts.filterable || [];
  const prefixFilterable = opts.prefixFilterable || {};
  const sortable = opts.sortable || [opts.pk || 'id'];
  const defaultSort = opts.defaultSort || opts.pk || 'id';

  /** The recycle bin and the live list are the same endpoint. */
  const wantsDeleted = function (req) { return flag(req.query.deleted); };

  async function list(req, res) {
    const paging = readPaging(req.query, sortable, defaultSort);

    const match = {};
    filterable.forEach(function (column) {
      if (req.query[column] !== undefined && req.query[column] !== '') {
        match[column] = req.query[column];
      }
    });

    /*
     * PREFIX FILTERS: a query parameter that narrows a column to everything
     * under a dotted name - `?chapter=institute` is `slot` equal to
     * 'institute' or starting 'institute.'. Declared per route as
     * { param: column }, so a route that declares none is unaffected.
     *
     * The value is held to letters, digits and '-' before it goes near a LIKE,
     * so it can never carry a '%' or '_' wildcard of its own.
     */
    const prefix = {};
    Object.keys(prefixFilterable).forEach(function (param) {
      const value = req.query[param];
      if (value !== undefined && /^[A-Za-z0-9-]+$/.test(String(value))) {
        prefix[prefixFilterable[param]] = String(value);
      }
    });

    const result = await service.search({
      q: req.query.q,
      deleted: wantsDeleted(req),
      match: match,
      prefix: prefix,
      /*
       * From the PAGE that was authorised, never from the query string -
       * see middleware/section.js. A table with no sectionFilter ignores
       * it, so this is free for the other thirty.
       */
      section_types: req.sectionTypes
    }, paging);
    return page(res, result, paging);
  }

  async function options(req, res) {
    return ok(res, await service.options(wantsDeleted(req)));
  }

  async function detail(req, res) {
    return ok(res, await service.detail(req.params.id, wantsDeleted(req)));
  }

  async function create(req, res) {
    return ok(res, await service.create(
      pick(req.body, columns), req.actor, pick(req.body, extras)), 'common.created');
  }

  async function update(req, res) {
    return ok(res, await service.update(
      req.params.id, pick(req.body, columns), req.actor, pick(req.body, extras)), 'common.updated');
  }

  async function remove(req, res) {
    await service.remove(req.params.id, req.actor);
    return ok(res, null, 'common.deleted');
  }

  async function restore(req, res) {
    await service.restore(req.params.id, req.actor);
    return ok(res, null, 'common.restored');
  }

  /** What refers to this row, so the console can explain before it asks. */
  async function dependents(req, res) {
    return ok(res, await service.dependents(req.params.id));
  }

  async function purge(req, res) {
    await service.purge(req.params.id, req.actor);
    return ok(res, null, 'common.deleted');
  }

  return {
    list: list,
    options: options,
    detail: detail,
    create: create,
    update: update,
    remove: remove,
    restore: restore,
    dependents: dependents,
    purge: purge
  };
};
