const Router = require('express-promise-router');
const createExcelController = require('../controllers/excel.controller');
const upload = require('../middleware/upload');
const controller = require('../controllers/agencies.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/agencies.service');
const mountPurge = require('./purge.routes');

const router = Router();

router.get('/meta', requirePermission(PAGE, LEVEL.READ), controller.meta);
router.get('/options', requirePermission(PAGE, LEVEL.READ), controller.options);
router.get('/provinces', requirePermission(PAGE, LEVEL.READ), controller.provinces);

/*
 * The service network, matched on the centre code.
 *
 * Which SERVICES a centre offers is not in the sheet: it is a second table
 * and a multi-select on the form, and flattening it into a comma separated
 * cell is how a centre quietly loses its Repair listing to a stray space.
 */
const sheet = createExcelController({
  table: 'agencies',
  pk: 'id',
  page: PAGE,
  matchOn: 'code',
  filename: 'service-centres',
  defaultSort: 'name',
  list: require('../services/agencies.service').search,
  filters: function (req) {
    return {
      q: req.query.q,
      province: req.query.province,
      status: req.query.status,
      tier: req.query.tier,
      section: req.query.section,
      service_type: req.query.service_type,
      deleted: req.query.deleted === '1' || req.query.deleted === 'true'
    };
  },
  columns: [
    { key: 'id', header: 'Id', width: 8, type: 'integer', readOnly: true },
    { key: 'code', header: 'Code', width: 12, required: true },
    { key: 'name', header: 'Name', width: 32, required: true },
    { key: 'province', header: 'Province', width: 16 },
    { key: 'address', header: 'Address', width: 44 },
    { key: 'phone', header: 'Phone', width: 18 },
    { key: 'tier', header: 'Tier', width: 8, type: 'integer' },
    { key: 'sla_hours', header: 'SLA hours', width: 12, type: 'integer' },
    { key: 'daily_capacity', header: 'Daily capacity', width: 15, type: 'integer' },
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
mountPurge(router, { table: 'agencies', pk: 'id', page: PAGE });

module.exports = router;
