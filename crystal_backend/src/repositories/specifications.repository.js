const db = require('../config/db');

const GROUPS = 'specification_groups';
const DEFS = 'specification_definitions';
const VALUES = 'product_specifications';

/**
 * The specification dictionary, and the values products supply against it.
 *
 * The interesting function here is `compare`, which is the reason the
 * dictionary exists at all: because specs are rows rather than columns, two
 * products can be lined up against each other without either declaring a
 * schema, and the alignment can be done once - here - instead of twice, in
 * two frontends that would each get the edge cases slightly differently.
 */

/** The dictionary, group by group, in the order it is drawn. */
/**
 * The dictionary a product editor should be offered.
 *
 * Scoped to the CATEGORY when one is given: a group pinned to a category is
 * offered only for products in it, and a group with no category applies
 * everywhere. Without the scope a television editor was asked for a front
 * camera and a handset editor for a backlight type.
 *
 * Called with no category by anything that genuinely wants the whole
 * dictionary - the console screen that maintains it.
 */
function dictionary(categoryId) {
  const qb = db(DEFS + ' as d')
    .join(GROUPS + ' as g', 'g.id', 'd.group_id')
    .orderBy([{ column: 'g.sort_order' }, { column: 'g.id' }, { column: 'd.sort_order' }, { column: 'd.id' }])
    .select('d.id', 'd.name', 'd.unit', 'd.compare_enabled', 'd.sort_order',
      'g.id as group_id', 'g.name as group_name', 'g.code as group_code',
      'g.product_category_id', 'g.sort_order as group_sort');

  if (categoryId) {
    qb.where(function () {
      this.where('g.product_category_id', categoryId)
        .orWhereNull('g.product_category_id');
    });
  }

  return qb;
}

/** One product's filled-in sheet, for the detail page's specification tab. */
function sheetOf(productId) {
  return db(VALUES + ' as v')
    .join(DEFS + ' as d', 'd.id', 'v.specification_id')
    .join(GROUPS + ' as g', 'g.id', 'd.group_id')
    .where('v.product_id', productId)
    .orderBy([{ column: 'g.sort_order' }, { column: 'd.sort_order' }, { column: 'd.id' }])
    .select('v.id', 'v.specification_id', 'v.value',
      'd.name', 'd.unit', 'd.compare_enabled',
      'g.id as group_id', 'g.name as group_name', 'g.code as group_code');
}

/**
 * The comparison matrix, pivoted here rather than in a browser.
 *
 * Only definitions marked compare_enabled, and only those at least one of the
 * products actually answers - a comparison whose rows are mostly blank is a
 * comparison nobody reads.  Rows come back with one cell per product IN THE
 * ORDER ASKED FOR, so the caller can render columns without matching anything
 * up, and a `differs` flag so the frontend can highlight without comparing
 * strings itself.
 */
async function compare(productIds) {
  if (!productIds.length) return { products: [], rows: [] };

  const products = await db('products as p')
    .whereIn('p.id', productIds)
    .where('p.is_deleted', false)
    .select('p.id', 'p.name', 'p.slug', 'p.main_image', 'p.main_image_mobile',
      'p.price', 'p.currency', 'p.tagline');

  // Requested order, not database order: the columns have to line up with the
  // order the user picked the products in.
  const ordered = productIds
    .map(function (id) {
      return products.find(function (p) { return p.id === Number(id); });
    })
    .filter(Boolean);

  const values = await db(VALUES + ' as v')
    .join(DEFS + ' as d', 'd.id', 'v.specification_id')
    .join(GROUPS + ' as g', 'g.id', 'd.group_id')
    .whereIn('v.product_id', ordered.map(function (p) { return p.id; }))
    .where('d.compare_enabled', true)
    .orderBy([{ column: 'g.sort_order' }, { column: 'd.sort_order' }, { column: 'd.id' }])
    .select('v.product_id', 'v.value', 'd.id as definition_id', 'd.name', 'd.unit',
      'g.id as group_id', 'g.name as group_name', 'g.sort_order as group_sort',
      'd.sort_order as def_sort');

  const rows = [];
  const index = {};

  values.forEach(function (value) {
    if (!index[value.definition_id]) {
      index[value.definition_id] = {
        definition_id: value.definition_id,
        name: value.name,
        unit: value.unit,
        group_id: value.group_id,
        group_name: value.group_name,
        // One cell per product, blank where a product has no answer - so
        // every row is the same length as the header.
        cells: ordered.map(function () { return null; }),
        differs: false
      };
      rows.push(index[value.definition_id]);
    }

    const column = ordered.findIndex(function (p) { return p.id === value.product_id; });
    if (column >= 0) index[value.definition_id].cells[column] = value.value;
  });

  rows.forEach(function (row) {
    const filled = row.cells.filter(function (cell) { return cell !== null; });
    row.differs = filled.length > 1 && filled.some(function (cell) { return cell !== filled[0]; });
  });

  return { products: ordered, rows: rows };
}

function findValue(productId, specificationId, trx) {
  return (trx || db)(VALUES)
    .where({ product_id: productId, specification_id: specificationId }).first();
}

/**
 * Writes one value, inserting or updating.
 *
 * The editor saves a whole sheet at once, so a read-then-write would race
 * with itself the moment two rows in that sheet are for the same definition.
 */
function upsertValue(productId, specificationId, value, trx) {
  return (trx || db)(VALUES)
    .insert({ product_id: productId, specification_id: specificationId, value: value })
    .onConflict(['product_id', 'specification_id'])
    .merge({ value: value })
    .returning('*');
}

function removeValue(productId, specificationId, trx) {
  return (trx || db)(VALUES)
    .where({ product_id: productId, specification_id: specificationId }).del();
}

module.exports = {
  GROUPS: GROUPS,
  DEFS: DEFS,
  VALUES: VALUES,
  dictionary: dictionary,
  sheetOf: sheetOf,
  compare: compare,
  findValue: findValue,
  upsertValue: upsertValue,
  removeValue: removeValue
};
