const repo = require('../repositories/parts.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/service/parts';
const TABLE = repo.TABLE;

const COLUMNS = ['part_no', 'name', 'component', 'unit_cost', 'currency',
  'warranty_months', 'lead_days', 'is_serialised', 'status'];

const SORTABLE = ['id', 'part_no', 'name', 'component', 'unit_cost', 'total_on_hand'];
const DEFAULT_SORT = 'part_no';

function search(filters, paging) {
  return repo.search(filters, paging);
}

function options(deleted) {
  return repo.options(deleted);
}

async function detail(id, deleted) {
  const part = await repo.findById(id, deleted);
  if (!part) throw new HttpError(404, 'common.partNotFound');

  const products = await repo.compatibilityOf(id);
  return { part: part, products: products };
}

/** The column is UNIQUE, so a repeat would be refused anyway - but as a
 *  constraint name rather than as the sentence that says which part number. */
async function assertPartNoFree(partNo, exceptId) {
  const clash = await repo.findByNo(partNo, exceptId);
  if (clash) throw new HttpError(409, 'common.duplicatedValue');
}

async function create(body, actor) {
  const data = Object.assign({}, body);
  data.part_no = String(data.part_no || '').trim();
  if (!data.part_no || !data.name) throw new HttpError(400, 'common.valueFailedAValidation');

  await assertPartNoFree(data.part_no, null);

  return transaction(async function (trx) {
    const rows = await repo.insert(data, trx);
    if (body.product_ids) await repo.replaceCompatibility(rows[0].id, body.product_ids, trx);

    audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
    return rows[0];
  });
}

async function update(id, body, actor) {
  const data = Object.assign({}, body);

  if (data.part_no !== undefined) {
    data.part_no = String(data.part_no).trim();
    if (!data.part_no) throw new HttpError(400, 'common.valueFailedAValidation');
    await assertPartNoFree(data.part_no, id);
  }

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.partNotFound');

  return transaction(async function (trx) {
    const rows = Object.keys(data).length ? await repo.update(id, data, trx) : [previous];
    if (body.product_ids) await repo.replaceCompatibility(id, body.product_ids, trx);

    audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
    return rows[0];
  });
}

async function remove(id, actor) {
  const previous = await repo.findRow(id);
  const affected = await repo.softDelete(id);
  if (!affected) throw new HttpError(404, 'common.partNotFound');
  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length) throw new HttpError(404, 'common.partNotFound');
  audit.restored(actor, TABLE, id, rows[0], PAGE);
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
  restore: restore
};
