const Router = require('express-promise-router');
const controller = require('../controllers/articles.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/blog.service');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/:id', requirePermission(PAGE, LEVEL.READ), controller.detail);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.create);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);
router.post('/:id/restore', requirePermission(PAGE, LEVEL.WRITE), controller.restore);

/*
 * Publishing is a level above writing.
 *
 * An editor writes and submits for review; putting something in front of
 * every customer on the website is somebody else's decision, and the grid is
 * where that distinction is made rather than in a code comment.
 */
router.post('/:id/status', requirePermission(PAGE, LEVEL.SUPER), controller.transition);

/*
 * PERMANENT DELETE, hand-written here rather than mounted.
 *
 * Every other router gets these two endpoints from purge.routes.js, which
 * answers "what still refers to this row" by reading PostgreSQL's foreign
 * keys. An article is in the vendor's database now, so there are no foreign
 * keys to read and no catalogue Crystal is allowed to introspect - the shared
 * factory would have reported no dependents at all, confidently.
 *
 * Same two rails as everywhere else: the article has to be in the recycle bin
 * already, and what would be destroyed alongside it is reported first.
 */
router.get('/:id/dependents', requirePermission(PAGE, LEVEL.WRITE), controller.dependents);
router.delete('/:id/permanent', requirePermission(PAGE, LEVEL.SUPER), controller.purge);

module.exports = router;
