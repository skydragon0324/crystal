const Router = require('express-promise-router');
const createExcelController = require('../controllers/excel.controller');
const upload = require('../middleware/upload');
const controller = require('../controllers/agencies.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/agencies.service');
const mountPurge = require('./purge.routes');
const agencies = require('../services/agencies.service');
const repo = require('../repositories/agencies.repository');

/*
 * A CENTRE'S NUMBERS IN ONE CELL, and back.
 *
 * Unlike the services, the numbers ARE in the sheet: they are what somebody
 * updating the network from a spreadsheet most often has in front of them, and
 * the sheet always carried the one number there was. One cell rather than a
 * column per number, because a centre has one, two or five of them.
 *
 *   Front desk: 400-820-1001; Repairs: 400-820-1002; 021-6234 5678
 *
 * A semicolon or a new line separates numbers; "Label:" in front of one is
 * its label. A colon is not something a phone number contains, so the split
 * is unambiguous. Written the same way on the way out, so an export edited
 * and sent back is read exactly as it was written.
 */
function phonesToCell(phones) {
  return (phones || []).map(function (entry) {
    return entry.label ? entry.label + ': ' + entry.phone : entry.phone;
  }).join('; ');
}

function phonesFromCell(text) {
  return String(text || '').split(/[;\n]+/)
    .map(function (part) { return part.trim(); })
    .filter(Boolean)
    .map(function (part) {
      const colon = part.lastIndexOf(':');
      return colon === -1
        ? { phone: part, label: null }
        : { phone: part.slice(colon + 1).trim(), label: part.slice(0, colon).trim() || null };
    });
}

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
  defaultSort: 'sort_order',
  list: agencies.search,
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
    /* Console-only, like the screen it comes from - an export is a console act. */
    { key: 'landmark', header: 'Landmark', width: 30 },
    {
      /*
       * THE NUMBERS, written into their own table after the row - `store`
       * is the way in for a cell the agencies table does not hold, as
       * `format` is the way out. A blank cell on a centre that exists
       * clears its numbers, the way a blank cell clears any field; the
       * column simply left out of the sheet leaves them alone.
       *
       * A sheet from before this change has a "Phone" column, and it is
       * still read - as a one-number list - so an old template keeps working.
       */
      key: 'phones', header: 'Phones', aliases: ['Phone'], width: 40,
      format: function (row) { return phonesToCell(row.phones); },
      store: async function (row, value, trx) {
        await repo.replacePhones(row.id, agencies.assertPhones(phonesFromCell(value)), trx);
      }
    },
    { key: 'tier', header: 'Tier', width: 8, type: 'integer' },
    { key: 'sla_hours', header: 'SLA hours', width: 12, type: 'integer' },
    { key: 'daily_capacity', header: 'Daily capacity', width: 15, type: 'integer' },
    /* Blank is "not placed" - after every numbered centre. */
    { key: 'sort_order', header: 'Display order', width: 14, type: 'integer' },
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
