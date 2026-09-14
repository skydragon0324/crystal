const repo = require('../repositories/media.repository');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/catalog/media';
const TABLE = repo.TABLE;

const COLUMNS = ['owner_type', 'owner_id', 'purpose', 'device_type', 'file_path',
  // A section hero is an advertisement, and an advertisement can be followed.
  'alt_text', 'link_url', 'width', 'height', 'sort_order'];

const SORTABLE = ['id', 'owner_type', 'owner_id', 'purpose', 'sort_order', 'created_at'];
const DEFAULT_SORT = 'created_at';

/**
 * The media library.
 *
 * Thin, because the interesting decisions about media are in the schema - the
 * polymorphic owner and the device split - and in the services that have to
 * clean up after themselves because there is no cascade to do it for them.
 */

function search(filters, paging) {
  return repo.search(filters, paging);
}

function ofOwner(ownerType, ownerId, options) {
  if (!repo.assertOwnerType(ownerType)) throw new HttpError(400, 'common.valueFailedAValidation');
  return repo.ofOwner(ownerType, ownerId, options || {});
}

async function create(data, actor) {
  if (!repo.assertOwnerType(data.owner_type)) throw new HttpError(400, 'common.valueFailedAValidation');
  if (!data.owner_id || !data.file_path) throw new HttpError(400, 'common.valueFailedAValidation');

  const rows = await repo.insert(Object.assign({}, data, {
    owner_type: String(data.owner_type).toUpperCase(),
    purpose: String(data.purpose || 'GALLERY').toUpperCase(),
    device_type: data.device_type || 'all'
  }));

  audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
  return rows[0];
}

async function update(id, data, actor) {
  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const previous = await repo.findById(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  const rows = await repo.update(id, data);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

/**
 * Removing an asset removes the row, not the file.
 *
 * Deliberate: the same file can be referenced by a product's main_image
 * column as well as by a gallery row, and deleting bytes because one of two
 * references went away leaves a broken image on a live page.  Orphaned files
 * are a housekeeping problem, and a much smaller one than a missing hero.
 */
async function remove(id, actor) {
  const previous = await repo.findById(id);
  const affected = await repo.remove(id);
  if (!affected) throw new HttpError(404, 'common.notFound');

  audit.deleted(actor, TABLE, id, previous, PAGE);
}

/** Re-orders a gallery in one go, because that is how it is edited. */
async function reorder(entries, actor) {
  const wanted = (entries || []).filter(function (e) { return e && e.id !== undefined; });
  if (!wanted.length) throw new HttpError(400, 'common.nothingToUpdate');

  for (let i = 0; i < wanted.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await repo.update(wanted[i].id, { sort_order: Number(wanted[i].sort_order) || (i + 1) * 10 });
  }

  audit.updated(actor, TABLE, 'reorder', null, { reordered: wanted.length }, PAGE);
  return { reordered: wanted.length };
}

module.exports = {
  PAGE: PAGE,
  COLUMNS: COLUMNS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  OWNERS: repo.OWNERS,
  search: search,
  ofOwner: ofOwner,
  create: create,
  update: update,
  remove: remove,
  reorder: reorder
};
