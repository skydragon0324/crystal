const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'warranty_claims';
const PK = 'id';
const TICKETS = 'repair_tickets';

const SEARCHABLE = ['c.claim_no', 'a.name', 'a.code'];

function scope(deleted) {
  return db(TABLE + ' as c')
    .join('agencies as a', 'a.id', 'c.agency_id')
    .leftJoin('managers as ad', 'ad.id', 'c.reviewed_by')
    .where('c.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.agency_id) qb.where('c.agency_id', filters.agency_id);
  if (filters.status !== undefined && filters.status !== '' && filters.status !== null) {
    qb.where('c.status', filters.status);
  }
  if (filters.month) qb.where('c.period_month', filters.month);
  if (filters.from) qb.where('c.period_month', '>=', filters.from);
  if (filters.to) qb.where('c.period_month', '<=', filters.to);
  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const sumRow = await qb.clone().clearSelect().first(
    db.raw('COALESCE(SUM(c.total_amount), 0) AS total_amount'),
    db.raw('COALESCE(SUM(c.approved_amount), 0) AS approved_amount'),
    db.raw('COUNT(*) FILTER (WHERE c.status = 1) AS awaiting_cnt'),
    db.raw('COALESCE(SUM(c.ticket_count), 0) AS ticket_count')
  );

  const rows = await qb.select('c.*', 'a.name as agency_name', 'a.code as agency_code',
    'ad.name as reviewed_by_name')
    .orderBy('c.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return {
    rows: rows,
    total: Number(countRow.c),
    summary: {
      total_amount: Number(sumRow.total_amount),
      approved_amount: Number(sumRow.approved_amount),
      awaiting_cnt: Number(sumRow.awaiting_cnt),
      ticket_count: Number(sumRow.ticket_count)
    }
  };
}

function findById(id, deleted) {
  return scope(deleted).where('c.id', id)
    .first('c.*', 'a.name as agency_name', 'a.code as agency_code', 'ad.name as reviewed_by_name');
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

function lockRow(id, trx) {
  return trx(TABLE).where(PK, id).forUpdate().first();
}

function findForMonth(agencyId, month, trx) {
  return (trx || db)(TABLE).where({ agency_id: agencyId, period_month: month }).first();
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

/**
 * The repairs a claim for this month would be made of.
 *
 * Closed, covered, and not already on another claim - the third condition is
 * what stops one repair being invoiced to head office twice, and it is a
 * NULL check rather than a status check because a ticket carries the claim it
 * went out on.
 *
 * Grouped by month on closed_at rather than received_at: a repair taken in on
 * the 30th and finished on the 2nd belongs to the month whose costs it
 * actually was.
 */
function claimableOf(agencyId, month, trx) {
  return (trx || db)(TICKETS + ' as t')
    .leftJoin('products as p', 'p.id', 't.product_id')
    .leftJoin('warranties as w', 'w.id', 't.warranty_id')
    .where('t.agency_id', agencyId)
    .where('t.is_warranty', true)
    .where('t.status', 7)
    .where('t.is_deleted', false)
    .whereNull('t.claim_id')
    .whereRaw("date_trunc('month', t.closed_at)::date = ?", [month])
    .orderBy('t.closed_at')
    .select('t.id', 't.ticket_no', 't.serial_number', 't.covered_amount', 't.parts_amount',
      't.labour_amount', 't.closed_at', 't.received_at',
      'p.name as product_name', 'w.warranty_no', 'w.kind as warranty_kind');
}

/** What is already on a claim, for its detail page. */
function ticketsOf(claimId) {
  return db(TICKETS + ' as t')
    .leftJoin('products as p', 'p.id', 't.product_id')
    .where('t.claim_id', claimId)
    .orderBy('t.closed_at')
    .select('t.id', 't.ticket_no', 't.serial_number', 't.covered_amount',
      't.received_at', 't.closed_at', 'p.name as product_name');
}

/** Stamps a batch of tickets onto a claim, in one statement. */
function attachTickets(claimId, ticketIds, trx) {
  return (trx || db)(TICKETS).whereIn('id', ticketIds).update({ claim_id: claimId });
}

/** Releases them again when a claim is cancelled, so they can be claimed later. */
function detachTickets(claimId, trx) {
  return (trx || db)(TICKETS).where('claim_id', claimId).update({ claim_id: null });
}

async function nextNumber(prefix, trx) {
  const row = await (trx || db)(TABLE)
    .where('claim_no', 'like', prefix + '%')
    .first(db.raw('MAX(claim_no) AS last_no'));

  const last = row && row.last_no ? Number(String(row.last_no).slice(prefix.length)) : 0;
  return prefix + String((isFinite(last) ? last : 0) + 1).padStart(4, '0');
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  search: search,
  findById: findById,
  findRow: findRow,
  lockRow: lockRow,
  findForMonth: findForMonth,
  insert: insert,
  update: update,
  softDelete: softDelete,
  claimableOf: claimableOf,
  ticketsOf: ticketsOf,
  attachTickets: attachTickets,
  detachTickets: detachTickets,
  nextNumber: nextNumber
};
