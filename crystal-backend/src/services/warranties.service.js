const repo = require('../repositories/warranties.repository');
const products = require('../repositories/products.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const { money } = require('../utils/query');
const audit = require('./audit.service');

const PAGE = '/admin/service/warranties';
const TABLE = repo.TABLE;

const COLUMNS = [
  'user_id', 'registered_product_id', 'product_id', 'serial_number', 'policy_id',
  'kind', 'source', 'start_date', 'end_date',
  'covers_parts', 'covers_labour', 'covers_accidental', 'claim_limit',
  'price_paid', 'points_used', 'currency', 'status', 'void_reason', 'remark'
];

const SORTABLE = ['id', 'warranty_no', 'serial_number', 'start_date', 'end_date', 'kind', 'status'];
const DEFAULT_SORT = 'end_date';

/**
 * Cover, as it was actually sold.
 *
 * The cover flags are copied off the policy onto the warranty rather than
 * read through it at claim time.  That is the whole design decision in this
 * file: a policy is an offer that the business changes, and a warranty is a
 * promise it already made.  Repricing CARE_PLUS in March must not quietly
 * change what somebody bought in January, and reading the flags through the
 * policy would do exactly that.
 */

function search(filters, paging) {
  return repo.search(filters, paging);
}

async function detail(id, deleted) {
  const row = await repo.findById(id, deleted);
  if (!row) throw new HttpError(404, 'warranties.warrantyNotFound');
  return row;
}

function historyOfDevice(serialNumber) {
  return repo.historyOfDevice(serialNumber);
}

/** What cover, if any, applies to this device on this day. */
function coveringDate(serialNumber, onDate) {
  return repo.coveringDate(serialNumber, onDate);
}

/** Months added to a date, worked out on dates rather than on milliseconds. */
function addMonths(startDate, months) {
  const d = new Date(startDate + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  // 31 January plus one month is 28 February, not 3 March.  setUTCMonth
  // overflows, so a day that moved backwards means it overflowed and the
  // answer is the last day of the month it should have landed in.
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** The day after, so consecutive cover meets end to end: no gap, no overlap. */
function dayAfter(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Today, as a plain date - the form every date column in this schema uses. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The cover a registration gets for free.
 *
 * Called by the member registration flow rather than by a person, so it takes
 * the actor it should be recorded against and returns null rather than
 * throwing when no policy applies - a product nobody has written a policy for
 * still registers, it simply registers without cover.
 */
async function issueStandard(input, actor, trx) {
  const product = input.product_id ? await products.findRow(input.product_id, trx) : null;
  if (!product) return null;

  const policy = await repo.defaultPolicyFor(product.category_id, product.series_id, trx);

  // No policy on file: fall back to the months the product itself declares,
  // and only give up when even that is zero.
  const months = policy ? policy.months : product.warranty_months;
  if (!months) return null;

  const start = input.start_date || today();

  return create({
    user_id: input.user_id || null,
    registered_product_id: input.registered_product_id || null,
    product_id: product.id,
    serial_number: input.serial_number,
    policy_id: policy ? policy.id : null,
    kind: 'STANDARD',
    source: 'REGISTRATION',
    start_date: start,
    end_date: addMonths(start, months),
    covers_parts: policy ? policy.covers_parts : true,
    covers_labour: policy ? policy.covers_labour : true,
    covers_accidental: policy ? policy.covers_accidental : false,
    claim_limit: policy ? policy.claim_limit : 0
  }, actor, trx);
}

/**
 * An extension bought with money or points.
 *
 * It starts the day after the cover it extends runs out, not today: a member
 * who renews a month early has bought thirteen months if it starts now, and
 * has been robbed of a month if the overlap is simply lost.  When there is
 * nothing to extend it starts today, which is the "lapsed and came back"
 * case.
 */
async function extend(input, actor) {
  const policy = await repo.findPolicy(input.policy_id);
  if (!policy) throw new HttpError(404, 'common.notFound');

  return transaction(async function (trx) {
    const existing = await repo.coveringDate(input.serial_number, today(), trx);
    const start = existing ? dayAfter(existing.end_date) : today();

    return create({
      user_id: input.user_id || null,
      registered_product_id: input.registered_product_id || null,
      product_id: input.product_id || (existing ? existing.product_id : null),
      serial_number: input.serial_number,
      policy_id: policy.id,
      kind: policy.kind,
      source: 'EXTENSION',
      start_date: start,
      end_date: addMonths(start, policy.months),
      covers_parts: policy.covers_parts,
      covers_labour: policy.covers_labour,
      covers_accidental: policy.covers_accidental,
      claim_limit: policy.claim_limit,
      price_paid: money(input.price_paid === undefined ? policy.price : input.price_paid),
      points_used: Number(input.points_used) || 0,
      currency: policy.currency
    }, actor, trx);
  });
}

async function create(data, actor, trx) {
  if (!data.serial_number) throw new HttpError(400, 'common.theDeviceSerialNumber');
  if (!data.start_date || !data.end_date) throw new HttpError(400, 'common.valueFailedAValidation');

  const run = async function (tx) {
    const body = Object.assign({}, data);
    body.warranty_no = await repo.nextNumber('W' + new Date().getFullYear(), tx);
    const rows = await repo.insert(body, tx);
    return rows[0];
  };

  const row = trx ? await run(trx) : await transaction(run);

  audit.created(actor, TABLE, row.id, row, PAGE);
  return row;
}

async function update(id, data, actor) {
  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'warranties.warrantyNotFound');

  const rows = await repo.update(id, data);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

/**
 * Voiding, which is not deleting.
 *
 * A voided warranty stays on the device's history with its reason attached,
 * because the question it answers - "I was told I was covered" - is asked
 * months later and cannot be answered by a row that is gone.
 */
async function voidCover(id, reason, actor) {
  if (!reason) throw new HttpError(400, 'common.valueFailedAValidation');

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'warranties.warrantyNotFound');
  if (previous.status === 'VOID') throw new HttpError(409, 'warranties.thisWarrantyHasBeen');

  const rows = await repo.update(id, { status: 'VOID', void_reason: reason });
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

/**
 * One more claim spent, under a lock.
 *
 * Called from inside the ticket transaction when a covered repair closes, so
 * that two tickets closing at once against a plan with one claim left cannot
 * both take it.  The CHECK constraint on the table refuses the overflow even
 * if this is ever bypassed.
 */
async function consumeClaim(warrantyId, trx) {
  const row = await repo.lockRow(warrantyId, trx);
  if (!row) throw new HttpError(404, 'warranties.warrantyNotFound');

  if (row.claim_limit > 0 && row.claims_used >= row.claim_limit) {
    throw new HttpError(409, 'warranties.theWarrantyHasAlready', null, { n: row.claims_used });
  }

  const rows = await repo.update(warrantyId, { claims_used: row.claims_used + 1 }, trx);
  return rows[0];
}

async function remove(id, actor) {
  const previous = await repo.findRow(id);
  const affected = await repo.softDelete(id);
  if (!affected) throw new HttpError(404, 'warranties.warrantyNotFound');
  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length) throw new HttpError(404, 'warranties.warrantyNotFound');
  audit.restored(actor, TABLE, id, rows[0], PAGE);
}

/** The nightly sweep. Returns how many rows it aged out, for the log. */
function expirePassed() {
  return repo.expirePassed();
}

module.exports = {
  PAGE: PAGE,
  COLUMNS: COLUMNS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,

  addMonths: addMonths,
  dayAfter: dayAfter,

  search: search,
  detail: detail,
  historyOfDevice: historyOfDevice,
  coveringDate: coveringDate,
  purchasablePoliciesFor: repo.purchasablePoliciesFor,

  issueStandard: issueStandard,
  extend: extend,
  create: create,
  update: update,
  voidCover: voidCover,
  consumeClaim: consumeClaim,
  remove: remove,
  restore: restore,
  expirePassed: expirePassed
};
