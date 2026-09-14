const repo = require('../repositories/products.repository');
const specifications = require('../repositories/specifications.repository');
const productImages = require('../repositories/productImages.repository');
const media = require('../repositories/media.repository');
const os = require('../repositories/os.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const { slugify } = require('../utils/slug');
const audit = require('./audit.service');

const PAGE = '/admin/catalog/products';
const TABLE = repo.TABLE;

const COLUMNS = ['category_id', 'series_id', 'name', 'slug', 'model_code', 'tagline',
  'description', 'main_image', 'main_image_mobile', 'price', 'currency',
  'release_date', 'status', 'is_featured', 'is_hero', 'warranty_months',
  'show_service_pricing', 'sort_order'];

const SORTABLE = ['id', 'name', 'slug', 'price', 'release_date', 'status', 'sort_order'];
const DEFAULT_SORT = 'sort_order';

function search(filters, paging) {
  return repo.search(filters, paging);
}

function options(deleted) {
  return repo.options(deleted);
}

/**
 * One product with everything the editor's tabs need.
 *
 * The dictionary comes back alongside the product's own values, because the
 * specification tab has to offer every definition - including the ones this
 * product has not answered yet, which are exactly the ones somebody opened
 * the tab to fill in.
 */
async function detail(id, deleted) {
  const product = await repo.findById(id, deleted);
  if (!product) throw new HttpError(404, 'common.notFound');

  const [dictionary, sheet, assets, images, history, pricing, colors, accessories]
    = await Promise.all([
      // Only the groups this product category actually uses - see the
      // repository. A television editor should not be asked for a front camera.
      specifications.dictionary(product.category_id),
      specifications.sheetOf(id),
      media.ofOwner('PRODUCT', id, {}),
      // The studio set and the advertising run are a relation of their own
      // now, not polymorphic artwork - see productImages.repository.
      productImages.ofProduct(id, {}),
      os.historyOf(id),
      require('../repositories/support.repository').pricesOf(id),
      repo.colorsOf([id]),
      repo.accessoriesOf(id)
    ]);

  return {
    product: product,
    dictionary: dictionary,
    specifications: sheet,
    media: assets,
    images: images,
    // Beside the sheet rather than inside it, exactly as the storefront
    // serves them - the editor is looking at the same product.
    colors: colors,
    accessories: accessories,
    os_history: history,
    service_pricing: pricing
  };
}

async function uniqueSlug(name, wanted, exceptId) {
  const base = slugify(wanted || name) || 'product';
  let candidate = base;

  for (let i = 2; i < 100; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const clash = await repo.findBySlug(candidate, exceptId);
    if (!clash) return candidate;
    candidate = base + '-' + i;
  }
  throw new HttpError(409, 'common.duplicatedValue');
}

async function create(body, actor) {
  const data = Object.assign({}, body);
  if (!data.name || !data.category_id) throw new HttpError(400, 'common.valueFailedAValidation');

  data.slug = await uniqueSlug(data.name, data.slug, null);

  return transaction(async function (trx) {
    const rows = await repo.insert(data, trx);
    // Only one product is the hero; promoting one demotes the rest.
    if (data.is_hero) await repo.clearHero(rows[0].id, trx);

    audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
    return rows[0];
  });
}

async function update(id, body, actor) {
  const data = Object.assign({}, body);

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  if (data.slug !== undefined || data.name !== undefined) {
    data.slug = await uniqueSlug(data.name || previous.name, data.slug || previous.slug, id);
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  return transaction(async function (trx) {
    const rows = await repo.update(id, data, trx);
    if (data.is_hero) await repo.clearHero(id, trx);

    audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
    return rows[0];
  });
}

/**
 * Removing a product also removes its polymorphic assets.
 *
 * media_assets has no foreign key - it cannot, it points at five tables - so
 * this is the price of that decision, paid explicitly rather than left to a
 * cascade that does not exist.
 *
 * product_images and product_os_history are NOT in here, deliberately: they
 * are real relations with a real foreign key, and both are soft-deleted along
 * with everything else the console can put in a recycle bin. A hard delete of
 * the product cascades them; a soft one should leave them exactly where they
 * are, or a restore would come back with no pictures.
 */
async function remove(id, actor) {
  const previous = await repo.findRow(id);

  await transaction(async function (trx) {
    const affected = await repo.softDelete(id, trx);
    if (!affected) throw new HttpError(404, 'common.notFound');
    await media.removeForOwner('PRODUCT', id, trx);
  });

  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length) throw new HttpError(404, 'common.notFound');
  audit.restored(actor, TABLE, id, rows[0], PAGE);
}

/**
 * Saves a whole specification sheet.
 *
 * One transaction, because a half saved sheet is a product whose compare row
 * disagrees with its own detail page - and an empty value DELETES rather than
 * storing a blank, so clearing a field on the form actually clears it.
 */
async function saveSpecifications(id, entries, actor) {
  const product = await repo.findRow(id);
  if (!product) throw new HttpError(404, 'common.notFound');

  const wanted = (entries || []).filter(function (entry) {
    return entry && entry.specification_id !== undefined;
  });
  if (!wanted.length) throw new HttpError(400, 'common.nothingToUpdate');

  await transaction(async function (trx) {
    for (let i = 0; i < wanted.length; i += 1) {
      const entry = wanted[i];
      const value = entry.value === undefined || entry.value === null ? '' : String(entry.value).trim();

      // eslint-disable-next-line no-await-in-loop
      if (!value) await specifications.removeValue(id, entry.specification_id, trx);
      // eslint-disable-next-line no-await-in-loop
      else await specifications.upsertValue(id, entry.specification_id, value, trx);
    }
  });

  audit.updated(actor, specifications.VALUES, id,
    { product_id: id }, { product_id: id, saved: wanted.length }, PAGE);

  return specifications.sheetOf(id);
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Reads an ordered list off the editor's table.
 *
 * An EMPTY list is a legal save here, unlike a specification sheet: a product
 * that ships with nothing in the box is a real answer, and refusing it would
 * leave the last accessory undeletable.  Rows with no name are dropped rather
 * than rejected, because an editor who adds a row and changes their mind
 * should not have to find and remove it before saving.
 */
function readEntries(entries, mapper) {
  return (entries || [])
    .filter(function (entry) { return entry && String(entry.name || '').trim(); })
    .map(mapper);
}

/** Two rows of one product cannot share a name - the table says so, and a
 *  constraint violation reaches the editor as a 500 rather than as advice. */
function assertDistinct(rows) {
  const seen = {};
  rows.forEach(function (row) {
    const key = row.name.toLowerCase();
    if (seen[key]) throw new HttpError(409, 'common.duplicatedValue');
    seen[key] = true;
  });
  return rows;
}

/**
 * Saves the finishes a product is offered in.
 *
 * The hex is checked HERE and not left to the column's CHECK constraint: the
 * constraint protects the table, but what it gives an editor who typed
 * `glacier blue` into the swatch field is a database error, not a sentence
 * about what the field wants.
 */
async function saveColors(id, entries, actor) {
  const product = await repo.findRow(id);
  if (!product) throw new HttpError(404, 'common.notFound');

  const wanted = assertDistinct(readEntries(entries, function (entry) {
    const hex = String(entry.hex || '').trim();
    if (!HEX.test(hex)) throw new HttpError(400, 'common.valueFailedAValidation');

    /*
     * A finish is a NAME and a HEX, and nothing else.
     *
     * There used to be an `image` here. It was stored, seeded and returned
     * by the API, and no page ever drew it: the swatch on a product card
     * and on the product page is painted from the hex, because the dot has
     * to be paintable before any artwork has loaded.
     */
    return {
      name: String(entry.name).trim().slice(0, 80),
      hex: hex.toUpperCase()
    };
  }));

  await transaction(function (trx) { return repo.replaceColors(id, wanted, trx); });

  audit.updated(actor, repo.COLORS, id,
    { product_id: id }, { product_id: id, saved: wanted.length }, PAGE);

  return repo.colorsOf([id]);
}

/** Saves what is in the box. */
async function saveAccessories(id, entries, actor) {
  const product = await repo.findRow(id);
  if (!product) throw new HttpError(404, 'common.notFound');

  const wanted = assertDistinct(readEntries(entries, function (entry) {
    return {
      name: String(entry.name).trim().slice(0, 120),
      image: entry.image ? String(entry.image).trim() : null
    };
  }));

  await transaction(function (trx) { return repo.replaceAccessories(id, wanted, trx); });

  audit.updated(actor, repo.ACCESSORIES, id,
    { product_id: id }, { product_id: id, saved: wanted.length }, PAGE);

  return repo.accessoriesOf(id);
}

/**
 * One entry in a product's OWN update record.
 *
 * `os_version` is a free string rather than a link to a Crystal OS release:
 * a television reports a firmware build that is not a Crystal OS version at
 * all, and a handset reports its own. See os.repository's header.
 */
async function saveOsHistory(id, entry, actor) {
  const product = await repo.findRow(id);
  if (!product) throw new HttpError(404, 'common.notFound');

  const version = entry && entry.os_version ? String(entry.os_version).trim() : '';
  if (!version) throw new HttpError(400, 'common.valueFailedAValidation');

  const payload = {
    os_version: version,
    release_date: entry.release_date || null,
    content: entry.content || null,
    pub_approve_number: entry.pub_approve_number || null,
    sort_order: Number(entry.sort_order) || 0
  };

  /*
   * The same endpoint edits and creates.
   *
   * There is no natural key to conflict on any more - a product may
   * legitimately record the same version twice, on two dates, for two
   * regions - so an edit says which row it means.
   */
  if (entry.id) {
    const previous = await os.historyOf(id);
    const before = previous.filter(function (row) { return row.id === Number(entry.id); })[0];
    if (!before) throw new HttpError(404, 'common.notFound');

    const updated = await os.updateHistory(entry.id, payload);
    audit.updated(actor, os.HISTORY, entry.id, before, updated[0], PAGE);
    return updated[0];
  }

  const rows = await os.addHistory(Object.assign({ product_id: id }, payload));
  audit.created(actor, os.HISTORY, rows[0].id, rows[0], PAGE);
  return rows[0];
}

async function removeOsHistory(id, historyId, actor) {
  const affected = await os.removeHistory(historyId);
  if (!affected) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, os.HISTORY, historyId, { id: historyId, product_id: id }, PAGE);
}

module.exports = {
  PAGE: PAGE,
  COLUMNS: COLUMNS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  search: search,
  options: options,
  detail: detail,
  create: create,
  update: update,
  remove: remove,
  restore: restore,
  saveSpecifications: saveSpecifications,
  saveColors: saveColors,
  saveAccessories: saveAccessories,
  saveOsHistory: saveOsHistory,
  removeOsHistory: removeOsHistory
};
