const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'warranties';
const PK = 'id';
const POLICIES = 'warranty_policies';

const SELECT = [
  'w.*',
  'p.name as product_name', 'p.slug as product_slug', 'p.model_code',
  'pol.code as policy_code', 'pol.name as policy_name',
  'u.nickname as member_nickname', 'u.phone as member_phone',
  db.raw('(w.end_date - CURRENT_DATE) AS days_to_expiry'),
  db.raw("(w.status = 'ACTIVE' AND w.end_date >= CURRENT_DATE) AS in_force")
];

const SEARCHABLE = ['w.warranty_no', 'w.serial_number', 'u.nickname', 'p.name'];

function scope(deleted) {
  return db(TABLE + ' as w')
    .leftJoin('products as p', 'p.id', 'w.product_id')
    .leftJoin(POLICIES + ' as pol', 'pol.id', 'w.policy_id')
    .leftJoin('users as u', 'u.id', 'w.user_id')
    .where('w.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.user_id) qb.where('w.user_id', filters.user_id);
  if (filters.product_id) qb.where('w.product_id', filters.product_id);
  if (filters.serial_number) qb.where('w.serial_number', filters.serial_number);
  if (filters.kind) qb.where('w.kind', filters.kind);
  if (filters.status) qb.where('w.status', filters.status);
  if (filters.source) qb.where('w.source', filters.source);

  // "Running out soon" is the only filter anybody uses twice: it is what the
  // extension campaign is built from.
  if (filters.expiring_days) {
    qb.where('w.status', 'ACTIVE')
      .whereRaw('w.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + ?::int)', [Number(filters.expiring_days)]);
  }
  if (filters.in_force) {
    qb.where('w.status', 'ACTIVE').whereRaw('w.end_date >= CURRENT_DATE');
  }
  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const sumRow = await qb.clone().clearSelect().first(
    db.raw("COUNT(*) FILTER (WHERE w.status = 'ACTIVE' AND w.end_date >= CURRENT_DATE) AS in_force_cnt"),
    db.raw("COUNT(*) FILTER (WHERE w.status = 'ACTIVE' AND w.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 60) AS expiring_cnt"),
    db.raw("COUNT(*) FILTER (WHERE w.kind <> 'STANDARD') AS paid_cnt"),
    db.raw('COALESCE(SUM(w.price_paid), 0) AS revenue')
  );

  const rows = await qb.select(SELECT)
    .orderBy('w.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return {
    rows: rows,
    total: Number(countRow.c),
    summary: {
      in_force_cnt: Number(sumRow.in_force_cnt),
      expiring_cnt: Number(sumRow.expiring_cnt),
      paid_cnt: Number(sumRow.paid_cnt),
      revenue: Number(sumRow.revenue)
    }
  };
}

function findById(id, deleted) {
  return scope(deleted).where('w.id', id).first(SELECT);
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

function lockRow(id, trx) {
  return trx(TABLE).where(PK, id).forUpdate().first();
}

/**
 * The cover in force for a device on a given day, best first.
 *
 * "Best" is the one that covers most, then the one that runs longest.  A
 * member who bought a CARE_PLUS plan should have the repair booked against it
 * rather than against the standard cover that happens to also still be live:
 * it is what they paid for, and it is the one with the accidental-damage
 * allowance on it.
 */
function coveringDate(serialNumber, onDate, trx) {
  return (trx || db)(TABLE)
    .where('serial_number', serialNumber)
    .where('status', 'ACTIVE')
    .where('is_deleted', false)
    .where('start_date', '<=', onDate)
    .where('end_date', '>=', onDate)
    .orderByRaw("CASE kind WHEN 'CARE_PLUS' THEN 0 WHEN 'EXTENDED' THEN 1 ELSE 2 END")
    .orderBy('end_date', 'desc')
    .first();
}

/** Every cover this device has had, for the ticket's warranty panel. */
function historyOfDevice(serialNumber) {
  return db(TABLE + ' as w')
    .leftJoin(POLICIES + ' as pol', 'pol.id', 'w.policy_id')
    .where('w.serial_number', serialNumber)
    .where('w.is_deleted', false)
    .orderBy('w.end_date', 'desc')
    .select('w.id', 'w.warranty_no', 'w.kind', 'w.status', 'w.start_date', 'w.end_date',
      'w.claims_used', 'w.claim_limit', 'pol.name as policy_name');
}

function insert(data, trx) {
  return (trx || db)(TABLE).insert(data).returning('*');
}

function update(id, data, trx) {
  return (trx || db)(TABLE).where(PK, id).update(data).returning('*');
}

function softDelete(id, trx) {
  return (trx || db)(TABLE).where(PK, id).update({ is_deleted: true });
}

function restore(id, trx) {
  return (trx || db)(TABLE).where(PK, id).update({ is_deleted: false }).returning('*');
}

async function nextNumber(prefix, trx) {
  const row = await (trx || db)(TABLE)
    .where('warranty_no', 'like', prefix + '%')
    .first(db.raw('MAX(warranty_no) AS last_no'));

  const last = row && row.last_no ? Number(String(row.last_no).slice(prefix.length)) : 0;
  return prefix + String((isFinite(last) ? last : 0) + 1).padStart(5, '0');
}

/**
 * The nightly sweep: cover whose last day has passed becomes EXPIRED.
 *
 * A status change rather than something inferred from end_date, so that "why
 * was this not covered" has an answer with a date on it, and so a member's
 * list shows a transition rather than silently reclassifying a row overnight.
 */
function expirePassed(trx) {
  return (trx || db)(TABLE)
    .where('status', 'ACTIVE')
    .whereRaw('end_date < CURRENT_DATE')
    .update({ status: 'EXPIRED', updated_at: db.fn.now() });
}

/* ------------------------------------------------------------------ */
/*  policies                                                           */
/* ------------------------------------------------------------------ */

/**
 * The default policy for a product: the most specific one wins.
 *
 * A policy pinned to the C9 series beats one pinned to Smartphone, because
 * somebody wrote the narrower rule on purpose - and a rule that never beats
 * the general case is a rule that does nothing.
 */
function defaultPolicyFor(categoryId, seriesId, trx) {
  return (trx || db)(POLICIES)
    .where('is_default', true)
    .where('status', 'ACTIVE')
    .where('is_deleted', false)
    .where(function () {
      this.where('series_id', seriesId || -1).orWhere(function () {
        this.whereNull('series_id').where('category_id', categoryId || -1);
      });
    })
    .orderByRaw('CASE WHEN series_id IS NOT NULL THEN 0 ELSE 1 END')
    .first();
}

function findPolicy(id, trx) {
  return (trx || db)(POLICIES).where('id', id).first();
}

/** The extensions a member can actually buy for a device they own. */
function purchasablePoliciesFor(categoryId, seriesId) {
  return db(POLICIES)
    .where('status', 'ACTIVE')
    .where('is_deleted', false)
    .whereNot('kind', 'STANDARD')
    .where(function () {
      this.where('series_id', seriesId || -1)
        .orWhere(function () { this.whereNull('series_id').where('category_id', categoryId || -1); });
    })
    .orderBy([{ column: 'sort_order' }, { column: 'months' }])
    .select('*');
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  POLICIES: POLICIES,
  search: search,
  findById: findById,
  findRow: findRow,
  lockRow: lockRow,
  coveringDate: coveringDate,
  historyOfDevice: historyOfDevice,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  nextNumber: nextNumber,
  expirePassed: expirePassed,
  defaultPolicyFor: defaultPolicyFor,
  findPolicy: findPolicy,
  purchasablePoliciesFor: purchasablePoliciesFor
};
