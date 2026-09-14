const Router = require('express-promise-router');
const createExcelController = require('../controllers/excel.controller');
const upload = require('../middleware/upload');
const users = require('../repositories/users.repository');
const controller = require('../controllers/members.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');

const router = Router();

/* ---- registered devices and licences, across every member ---- */
router.get('/registrations', requirePermission(controller.REGISTRATIONS_PAGE, LEVEL.READ), controller.registrations);
router.get('/licenses', requirePermission(controller.LICENSES_PAGE, LEVEL.READ), controller.licenses);

/* ---- feedback ---- */
router.get('/feedback', requirePermission(controller.FEEDBACK_PAGE, LEVEL.READ), controller.feedback);

/*
 * Declared BEFORE '/feedback/:id', because 'counts' is a perfectly good id
 * as far as the router is concerned and the first match wins.
 */
router.get('/feedback/counts', requirePermission(controller.FEEDBACK_PAGE, LEVEL.READ), controller.feedbackCounts);
router.get('/feedback/:id', requirePermission(controller.FEEDBACK_PAGE, LEVEL.READ), controller.feedbackDetail);

router.post('/feedback/:id/reply', requirePermission(controller.FEEDBACK_PAGE, LEVEL.WRITE), controller.reply);
router.post('/feedback/:id/resolve', requirePermission(controller.FEEDBACK_PAGE, LEVEL.WRITE), controller.resolveFeedback);
router.delete('/feedback/:id', requirePermission(controller.FEEDBACK_PAGE, LEVEL.WRITE), controller.removeFeedback);

/* ---- accounts ---- */
/*
 * Members are EXPORT ONLY.
 *
 * An account is created by the person it belongs to, carries a password and a
 * wallet, and is the one record in this system that represents a human being
 * rather than a thing the company owns.  A spreadsheet is not a legitimate
 * way to make one, and there is no sensible answer to what importing a row
 * with a new email against an existing id would even mean.
 */
const sheet = createExcelController({
  table: 'users',
  pk: 'id',
  page: controller.PAGE,
  readOnly: true,
  filename: 'members',
  defaultSort: 'created_at',
  list: users.search,
  filters: function (req) {
    return {
      q: req.query.q,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to
    };
  },
  columns: [
    { key: 'id', header: 'Id', width: 8, type: 'integer' },
    { key: 'nickname', header: 'Name', width: 24 },
    { key: 'email', header: 'Email', width: 30 },
    { key: 'phone', header: 'Phone', width: 18 },
    { key: 'status', header: 'Status', width: 12 },
    { key: 'device_cnt', header: 'Devices', width: 10, type: 'integer' },
    { key: 'ticket_cnt', header: 'Repairs', width: 10, type: 'integer' },
    { key: 'point_balance', header: 'Points', width: 12, type: 'integer' },
    { key: 'balance', header: 'Wallet', width: 12, type: 'number' },
    { key: 'last_login_at', header: 'Last seen', width: 14, type: 'date' },
    { key: 'created_at', header: 'Joined', width: 14, type: 'date' }
  ]
});

router.get('/export', requirePermission(controller.PAGE, LEVEL.READ), sheet.exportRows);

router.get('/', requirePermission(controller.PAGE, LEVEL.READ), controller.list);
router.get('/:id', requirePermission(controller.PAGE, LEVEL.READ), controller.detail);

/*
 * Locking somebody out of their account is not an ordinary edit, and there is
 * deliberately nothing here that can touch a wallet: a balance is the sum of
 * a ledger, and an endpoint that could set it directly would break that.
 */
router.post('/:id/status', requirePermission(controller.PAGE, LEVEL.SUPER), controller.setStatus);

module.exports = router;
