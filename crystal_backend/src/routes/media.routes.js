const Router = require('express-promise-router');
const controller = require('../controllers/media.controller');
const upload = require('../middleware/upload');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/media.service');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/:ownerType/:ownerId', requirePermission(PAGE, LEVEL.READ), controller.ofOwner);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.create);
router.put('/reorder', requirePermission(PAGE, LEVEL.WRITE), controller.reorder);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);

/*
 * The folder is a path parameter and is checked against a whitelist in
 * config/storage - never taken from the body, because a caller that could
 * name its own destination could write outside the upload root with `../`.
 */
router.post('/upload/:folder',
  requirePermission(PAGE, LEVEL.WRITE),
  function (req, res, next) {
    return upload.image(String(req.params.folder)).single('file')(req, res, next);
  },
  controller.uploadImage);

/*
 * The same two-step, for a file that is not artwork: an approval certificate
 * attached to a published price, say.  A route of its own rather than a flag
 * on the one above, so the artwork endpoint's filter cannot be widened by a
 * request.
 */
router.post('/upload-document/:folder',
  requirePermission(PAGE, LEVEL.WRITE),
  function (req, res, next) {
    return upload.document(String(req.params.folder)).single('file')(req, res, next);
  },
  controller.uploadImage);

module.exports = router;
