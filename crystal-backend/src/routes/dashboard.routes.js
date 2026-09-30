const Router = require('express-promise-router');
const controller = require('../controllers/dashboard.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/dashboard.service');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.overview);

/*
 * THE CERTIFICATES' EXPIRY, behind the DASHBOARD's permission rather than none.
 *
 * It could have been chrome, like the header's search and bell, which answer
 * any signed-in administrator. It is not, because it has a page: the card that
 * explains it is on the dashboard, and the header's indicator is a way of
 * getting there. A role that cannot open the dashboard would be shown a
 * warning whose "see the details" leads to a refusal - so it is not shown
 * one, and the console renders nothing when this answers 403. Every seeded
 * role can read the dashboard, so in practice every administrator sees it.
 *
 * READ, not a new page of its own: nothing here can be changed from the
 * console, and what it shows - names, issuers and dates off public
 * certificates - is no more sensitive than the rest of the front page.
 * Renewing is a deployment, not a button.
 */
router.get('/certificates', requirePermission(PAGE, LEVEL.READ), controller.certificates);

module.exports = router;
