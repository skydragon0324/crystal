const Router = require('express-promise-router');
const { ok } = require('../utils/response');
const config = require('../config');
const db = require('../config/db');
const oracle = require('../config/oracle');
const legacy = require('../config/legacy');
const remote = require('../config/remote');

/**
 * Everything under /api, in the order it has to be declared.
 *
 * Three audiences share this prefix and they are separated by path rather
 * than by guesswork:
 *
 *   /api/auth        members signing in (spec 5, device aware)
 *   /api/account     the member centre, guarded by a member token
 *   /api/admin/auth  the console signing in
 *   /api/admin       the console, guarded by an admin token and the grid
 *   /api/...         the customer website, open and read only
 *
 * The storefront is mounted LAST because it owns the root of the prefix -
 * /products, /categories, /blog - and anything declared after it would be
 * shadowed by its /:slug routes.
 */
const router = Router();

/**
 * Liveness.
 *
 * Oracle answers 'disabled' rather than 'down' when it is switched off: the
 * platform is designed to run that way and nobody should be paged for a
 * deliberate configuration.
 */
router.get('/health', async function (req, res) {
  let postgres = 'down';
  try {
    await db.raw('SELECT 1');
    postgres = 'up';
  } catch (err) {
    postgres = 'down';
  }

  return ok(res, {
    service: 'crystal-backend',
    env: config.env,
    schema: config.db.schema,
    engines: {
      postgres: postgres,
      oracle: await oracle.state(),
      /*
       * THE ONE THAT CAN TAKE PAGES DOWN. The warehouse above degrades to a
       * local mirror when it is off; feedback and the blog have nowhere to
       * degrade to, so this line is what says which database an empty inbox
       * came from. It names the driver because a deployment reading
       * "postgres" here has not been switched over.
       */
      legacy: { driver: legacy.driver(), state: await legacy.state() },

      /*
       * 'mock' is not 'up'. A deployment reading 'mock' here is serving
       * invented orders to real customers, and that belongs on the status
       * endpoint rather than in somebody's environment file.
       */
      storefronts: remote.state()
    },
    device: req.device ? req.device.detected : null,
    time: new Date().toISOString()
  });
});

/* ---- the console ---- */
router.use('/admin/auth', require('./auth.routes'));
router.use('/admin', require('./admin.routes'));

/* ---- members ---- */
router.use('/auth', require('./memberAuth.routes'));
router.use('/account', require('./account.routes'));

/* ---- the customer website, at the root of the prefix ---- */
router.use('/', require('./storefront.routes'));

module.exports = router;
