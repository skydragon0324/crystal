const service = require('../services/media.service');
const upload = require('../middleware/upload');
const { ok, page } = require('../utils/response');
const { readPaging, pick } = require('../utils/query');

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await service.search({
    q: req.query.q,
    owner_type: req.query.owner_type,
    owner_id: req.query.owner_id,
    purpose: req.query.purpose,
    device_type: req.query.device_type
  }, paging);

  return page(res, result, paging);
}

async function ofOwner(req, res) {
  return ok(res, await service.ofOwner(req.params.ownerType, req.params.ownerId, {
    purpose: req.query.purpose,
    device: req.query.device
  }));
}

async function create(req, res) {
  return ok(res, await service.create(pick(req.body, service.COLUMNS), req.actor), 'common.created');
}

async function update(req, res) {
  return ok(res, await service.update(req.params.id, pick(req.body, service.COLUMNS), req.actor), 'common.updated');
}

async function remove(req, res) {
  await service.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

async function reorder(req, res) {
  return ok(res, await service.reorder(req.body.entries, req.actor), 'common.updated');
}

/**
 * An upload, which is two steps: the bytes land on disk and then a row is
 * written pointing at them.
 *
 * They are one endpoint because a file with no row is invisible and a row
 * with no file is broken - and a client that had to make two calls would
 * eventually make only the first.
 */
async function uploadImage(req, res) {
  if (!req.file) throw new (require('../utils/response').HttpError)(400, 'common.valueFailedAValidation');

  const folder = String(req.params.folder || 'misc');
  const filePath = upload.toPublicPath(folder, req.file);

  // An upload that names no owner is just a file - the editor uses it for
  // the cover image columns, which store a path rather than a media row.
  if (!req.body.owner_type || !req.body.owner_id) {
    return ok(res, { file_path: filePath }, 'common.created');
  }

  const row = await service.create({
    owner_type: req.body.owner_type,
    owner_id: req.body.owner_id,
    purpose: req.body.purpose || 'GALLERY',
    device_type: req.body.device_type || 'all',
    file_path: filePath,
    alt_text: req.body.alt_text || null,
    link_url: req.body.link_url || null,
    sort_order: Number(req.body.sort_order) || 0
  }, req.actor);

  return ok(res, row, 'common.created');
}

module.exports = {
  list: list,
  ofOwner: ofOwner,
  create: create,
  update: update,
  remove: remove,
  reorder: reorder,
  uploadImage: uploadImage
};
