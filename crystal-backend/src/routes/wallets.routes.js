const Router = require('express-promise-router');
const controller = require('../controllers/wallets.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');

/**
 * Member wallets and points.
 *
 * READ, plus ONE WRITE. Listing and the two ledgers are what the job needs;
 * the write is a manual adjustment, which exists because the alternative to a
 * screen is somebody editing `wallets.balance` by hand, with no ledger row
 * behind it and no audit trail in front of it.
 *
 * NO DELETE, and that is deliberate rather than unfinished. A ledger row is
 * the evidence that a balance is what it says it is; removing one leaves a
 * total nothing can reconcile. A movement made in error is corrected by an
 * adjustment that names it, which is how the paper version works too.
 */

const router = Router();
const PAGE = '/admin/members/wallets';

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/:userId', requirePermission(PAGE, LEVEL.READ), controller.detail);
router.get('/:userId/transactions', requirePermission(PAGE, LEVEL.READ), controller.transactions);
router.get('/:userId/points', requirePermission(PAGE, LEVEL.READ), controller.points);
router.get('/:userId/point-summary', requirePermission(PAGE, LEVEL.READ), controller.pointSummary);

router.post('/:userId/adjust', requirePermission(PAGE, LEVEL.WRITE), controller.adjust);

module.exports = router;
