const Router = require('express-promise-router');
const createExcelController = require('../controllers/excel.controller');
const upload = require('../middleware/upload');
const controller = require('../controllers/products.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { requireSection } = require('../middleware/section');
const { PAGE } = require('../services/products.service');
const mountPurge = require('./purge.routes');

const router = Router();

router.get('/options', requirePermission(PAGE, LEVEL.READ), controller.options);

/*
 * The catalogue as a spreadsheet.
 *
 * Matched on the MODEL CODE rather than the id: that is the number the
 * warehouse, the serial mirror and the price list all know a product by, and
 * it is what somebody editing a sheet will have kept.  The section and line
 * names ride along read-only so the sheet is legible without letting a
 * product be moved between categories by typing a different word.
 */
const sheet = createExcelController({
  table: 'products',
  pk: 'id',
  page: PAGE,
  matchOn: 'model_code',
  filename: 'products',
  defaultSort: 'sort_order',
  list: require('../services/products.service').search,
  filters: function (req) {
    return {
      q: req.query.q,
      category_id: req.query.category_id,
      series_id: req.query.series_id,
      status: req.query.status,
      is_featured: req.query.is_featured,
      deleted: req.query.deleted === '1' || req.query.deleted === 'true'
    };
  },
  columns: [
    { key: 'id', header: 'Id', width: 8, type: 'integer', readOnly: true },
    { key: 'model_code', header: 'Model code', width: 16, required: true },
    { key: 'name', header: 'Name', width: 28, required: true },
    { key: 'slug', header: 'Slug', width: 20 },
    { key: 'category_name', header: 'Section', width: 18, readOnly: true },
    { key: 'series_name', header: 'Line', width: 14, readOnly: true },
    { key: 'tagline', header: 'Tagline', width: 46 },
    { key: 'price', header: 'Price', width: 12, type: 'number' },
    { key: 'currency', header: 'Currency', width: 10 },
    { key: 'release_date', header: 'Released', width: 14, type: 'date' },
    { key: 'warranty_months', header: 'Warranty months', width: 16, type: 'integer' },
    { key: 'rating_avg', header: 'Rating', width: 10, type: 'number' },
    { key: 'rating_count', header: 'Ratings', width: 10, type: 'integer' },
    { key: 'is_featured', header: 'Featured', width: 10, type: 'boolean' },
    { key: 'sort_order', header: 'Order', width: 10, type: 'integer' },
    { key: 'status', header: 'Status', width: 12, values: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }
  ]
});

router.get('/export', requirePermission(PAGE, LEVEL.READ), sheet.exportRows);
router.post('/import', requirePermission(PAGE, LEVEL.WRITE),
  upload.spreadsheet().single('file'), sheet.importRows);
/*
 * The list is guarded by the SECTION page when one is named, so the
 * eproduct manager cannot read the smartphone catalogue by calling the API
 * directly. The section is then pinned onto the request and the filter
 * comes from there - see middleware/section.js.
 */
router.get('/', requireSection(PAGE, LEVEL.READ), controller.list);
router.get('/:id', requirePermission(PAGE, LEVEL.READ), controller.detail);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.create);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);
router.post('/:id/restore', requirePermission(PAGE, LEVEL.WRITE), controller.restore);

router.put('/:id/specifications', requirePermission(PAGE, LEVEL.WRITE), controller.saveSpecifications);
router.put('/:id/colors', requirePermission(PAGE, LEVEL.WRITE), controller.saveColors);
router.put('/:id/accessories', requirePermission(PAGE, LEVEL.WRITE), controller.saveAccessories);

/*
 * A products OWN update record. The same endpoint creates and edits - the
 * body carries an id when it means an existing row - because there is no
 * natural key to conflict on any more: a product may legitimately record the
 * same version twice, on two dates, for two regions.
 */
router.post('/:id/os-history', requirePermission(PAGE, LEVEL.WRITE), controller.addOsHistory);
router.put('/:id/os-history/:historyId', requirePermission(PAGE, LEVEL.WRITE), controller.saveOsHistory);
router.delete('/:id/os-history/:historyId', requirePermission(PAGE, LEVEL.WRITE), controller.removeOsHistory);

/*
 * Permanent delete, written once and mounted rather than repeated - see
 * purge.routes.js. Same two rails as everywhere else: the row has to be in
 * the recycle bin, and anything still referring to it refuses the delete
 * with a list of what and how many.
 */
mountPurge(router, { table: 'products', pk: 'id', page: PAGE });

module.exports = router;
