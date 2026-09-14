const Router = require('express-promise-router');
const createExcelController = require('../controllers/excel.controller');
const upload = require('../middleware/upload');
const controller = require('../controllers/parts.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/parts.service');
const mountPurge = require('./purge.routes');

const router = Router();

router.get('/meta', requirePermission(PAGE, LEVEL.READ), controller.meta);
router.get('/options', requirePermission(PAGE, LEVEL.READ), controller.options);

/*
 * The parts catalogue, matched on the part number.
 *
 * Stock levels are deliberately NOT here.  A shelf is the sum of its
 * movements - see the parts ledger - and a spreadsheet that could set one
 * directly would break the reconciliation the whole after-sales module rests
 * on.  What a buyer maintains in bulk is the cost and the lead time, and that
 * is what this sheet carries.
 */
const sheet = createExcelController({
  table: 'parts',
  pk: 'id',
  page: PAGE,
  matchOn: 'part_no',
  filename: 'parts',
  defaultSort: 'part_no',
  list: require('../services/parts.service').search,
  filters: function (req) {
    return {
      q: req.query.q,
      component: req.query.component,
      status: req.query.status,
      product_id: req.query.product_id,
      deleted: req.query.deleted === '1' || req.query.deleted === 'true'
    };
  },
  columns: [
    { key: 'id', header: 'Id', width: 8, type: 'integer', readOnly: true },
    { key: 'part_no', header: 'Part no', width: 16, required: true },
    { key: 'name', header: 'Name', width: 32, required: true },
    { key: 'component', header: 'Component', width: 18 },
    { key: 'unit_cost', header: 'Unit cost', width: 12, type: 'number' },
    { key: 'currency', header: 'Currency', width: 10 },
    { key: 'warranty_months', header: 'Warranty months', width: 16, type: 'integer' },
    { key: 'lead_days', header: 'Lead days', width: 12, type: 'integer' },
    { key: 'is_serialised', header: 'Serialised', width: 12, type: 'boolean' },
    { key: 'total_on_hand', header: 'On hand', width: 10, type: 'integer', readOnly: true },
    { key: 'status', header: 'Status', width: 12, values: ['ACTIVE', 'INACTIVE'] }
  ]
});

router.get('/export', requirePermission(PAGE, LEVEL.READ), sheet.exportRows);
router.post('/import', requirePermission(PAGE, LEVEL.WRITE),
  upload.spreadsheet().single('file'), sheet.importRows);
router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/:id', requirePermission(PAGE, LEVEL.READ), controller.detail);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.create);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);
router.post('/:id/restore', requirePermission(PAGE, LEVEL.WRITE), controller.restore);

/*
 * Permanent delete, written once and mounted rather than repeated - see
 * purge.routes.js. Same two rails as everywhere else: the row has to be in
 * the recycle bin, and anything still referring to it refuses the delete
 * with a list of what and how many.
 */
mountPurge(router, { table: 'parts', pk: 'id', page: PAGE });

module.exports = router;
