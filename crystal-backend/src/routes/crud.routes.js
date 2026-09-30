const Router = require('express-promise-router');
const createCrudController = require('../controllers/crud.controller');
const createExcelController = require('../controllers/excel.controller');
const createCrudService = require('../services/crud.service');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { requireSection } = require('../middleware/section');
const upload = require('../middleware/upload');

/**
 * A REST router for a plain master table.
 *
 * The same seven endpoints every simple table needs, wired to the generic
 * controller / service / repository underneath.  Nothing about the shape of
 * this file is special: it declares urls and the permission each one sits
 * behind, exactly as a hand written route file does.
 *
 * Options are documented on repositories/crud.repository.js, which is the
 * layer that actually acts on them.
 */
module.exports = function crudFactory(opts) {
  const controller = createCrudController(opts);
  const page = opts.page;

  const router = Router();

  /*
   * A table that can be split by section is guarded by the SECTION page
   * when the request names one, so the eproduct manager cannot read the
   * smartphone list by calling the API directly. Everything else keeps
   * the plain page guard.
   */
  const listGuard = opts.sectionFilter
    ? requireSection(page, LEVEL.READ)
    : requirePermission(page, LEVEL.READ);

  router.get('/', listGuard, controller.list);
  router.get('/options', requirePermission(page, LEVEL.READ), controller.options);

  /*
   * The spreadsheet pair, offered whenever the table describes its columns.
   *
   * Declared BEFORE '/:id', because '/export' is a perfectly good id as far
   * as the router is concerned and the first match wins.
   */
  if (opts.excel) {
    const service = createCrudService(opts);
    const sheet = createExcelController(Object.assign({
      table: opts.table,
      pk: opts.pk || 'id',
      page: page,
      defaultSort: opts.defaultSort,
      list: service.search,
      /* A signed table's import signs every row it writes - see excel.controller.js. */
      signed: opts.signed || null
    }, opts.excel));

    router.get('/export', requirePermission(page, LEVEL.READ), sheet.exportRows);
    router.post(
      '/import',
      requirePermission(page, LEVEL.WRITE),
      upload.spreadsheet().single('file'),
      sheet.importRows
    );
  }

  router.get('/:id', requirePermission(page, LEVEL.READ), controller.detail);

  router.post('/', requirePermission(page, LEVEL.WRITE), controller.create);
  router.put('/:id', requirePermission(page, LEVEL.WRITE), controller.update);
  router.delete('/:id', requirePermission(page, LEVEL.WRITE), controller.remove);
  router.post('/:id/restore', requirePermission(page, LEVEL.WRITE), controller.restore);

  /*
   * PERMANENT DELETE, behind the highest permission this system has.
   *
   * A soft delete is reversible and a write-level administrator may do it.
   * This is not reversible, so it takes SUPER - the highest grant a page
   * has, and one an ordinary editor does not hold.
   */
  router.get('/:id/dependents', requirePermission(page, LEVEL.WRITE), controller.dependents);
  router.delete('/:id/permanent', requirePermission(page, LEVEL.SUPER), controller.purge);

  return router;
};
