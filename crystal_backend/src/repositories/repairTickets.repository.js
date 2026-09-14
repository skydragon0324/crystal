const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'repair_tickets';
const PK = 'id';
const ITEMS = 'repair_ticket_items';
const EVENTS = 'repair_ticket_events';

/**
 * A ticket is never shown without the four things that identify it in
 * conversation: the device, the centre, the customer and the fault.  Three of
 * those are foreign keys, so the join is here rather than repeated at every
 * caller - and the list, the detail and the printed job sheet all read the
 * same names for them.
 */
const SELECT = [
  't.*',
  'p.name as product_name', 'p.slug as product_slug', 'p.model_code',
  'c.name as category_name',
  'g.name as agency_name', 'g.code as agency_code', 'g.province as agency_province', 'g.sla_hours',
  'tec.name as technician_name', 'tec.grade as technician_grade',
  'sy.code as symptom_code', 'sy.name as symptom_name', 'sy.component', 'sy.severity',
  'u.nickname as member_nickname',
  'w.warranty_no', 'w.kind as warranty_kind', 'w.end_date as warranty_end_date',
  db.raw("(t.status < 7 AND t.promised_at < now()) AS is_overdue"),
  db.raw("ROUND(EXTRACT(EPOCH FROM (COALESCE(t.closed_at, now()) - t.received_at))::numeric / 86400.0, 1) AS age_days")
];

const SEARCHABLE = ['t.ticket_no', 't.serial_number', 't.customer_name', 't.customer_phone', 'p.name'];

function scope(deleted) {
  return db(TABLE + ' as t')
    .leftJoin('products as p', 'p.id', 't.product_id')
    .leftJoin('product_categories as c', 'c.id', 'p.category_id')
    .join('agencies as g', 'g.id', 't.agency_id')
    .leftJoin('technicians as tec', 'tec.id', 't.technician_id')
    .leftJoin('symptom_catalog as sy', 'sy.id', 't.symptom_id')
    .leftJoin('users as u', 'u.id', 't.user_id')
    .leftJoin('warranties as w', 'w.id', 't.warranty_id')
    .where('t.is_deleted', !!deleted);
}

/**
 * `open` and `overdue` are filters over a computed condition rather than over
 * a column, which is why they are spelled out here instead of being handled
 * by the generic filter loop: "open" is a range on status, not a value.
 */
function applyFilters(qb, filters) {
  if (filters.agency_id) qb.where('t.agency_id', filters.agency_id);
  if (filters.technician_id) qb.where('t.technician_id', filters.technician_id);
  if (filters.product_id) qb.where('t.product_id', filters.product_id);
  if (filters.symptom_id) qb.where('t.symptom_id', filters.symptom_id);
  if (filters.user_id) qb.where('t.user_id', filters.user_id);
  if (filters.claim_id) qb.where('t.claim_id', filters.claim_id);
  if (filters.serial_number) qb.where('t.serial_number', filters.serial_number);

  if (filters.status !== undefined && filters.status !== '' && filters.status !== null) {
    qb.where('t.status', filters.status);
  }
  if (filters.pay_state !== undefined && filters.pay_state !== '' && filters.pay_state !== null) {
    qb.where('t.pay_state', filters.pay_state);
  }
  if (filters.priority !== undefined && filters.priority !== '' && filters.priority !== null) {
    qb.where('t.priority', filters.priority);
  }
  if (filters.is_warranty !== undefined && filters.is_warranty !== null && filters.is_warranty !== '') {
    qb.where('t.is_warranty', filters.is_warranty === true || filters.is_warranty === '1' || filters.is_warranty === 'true');
  }

  if (filters.open) qb.where('t.status', '<', 7);
  if (filters.overdue) qb.where('t.status', '<', 7).whereRaw('t.promised_at < now()');
  if (filters.unrated) qb.where('t.status', 7).whereNull('t.rating');
  if (filters.claimable) qb.where({ 't.is_warranty': true, 't.status': 7 }).whereNull('t.claim_id');

  if (filters.from) qb.where('t.received_at', '>=', filters.from);
  if (filters.to) qb.whereRaw("t.received_at < (?::date + interval '1 day')", [filters.to]);
  return qb;
}

/**
 * The list, plus the four numbers printed above it.
 *
 * The summary is deliberately taken over the SAME filtered query rather than
 * over the page: a total that only counted the twenty rows on screen would be
 * a different number on every page, which is worse than no number at all.
 */
async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const sumRow = await qb.clone().clearSelect().first(
    db.raw('COUNT(*) FILTER (WHERE t.status < 7) AS open_cnt'),
    db.raw('COUNT(*) FILTER (WHERE t.status < 7 AND t.promised_at < now()) AS overdue_cnt'),
    db.raw('COUNT(*) FILTER (WHERE t.is_warranty) AS warranty_cnt'),
    db.raw('COALESCE(SUM(t.total_amount), 0) AS charged_amount'),
    db.raw('COALESCE(SUM(t.covered_amount), 0) AS covered_amount')
  );

  const rows = await qb.select(SELECT)
    .orderBy('t.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return {
    rows: rows,
    total: Number(countRow.c),
    summary: {
      open_cnt: Number(sumRow.open_cnt),
      overdue_cnt: Number(sumRow.overdue_cnt),
      warranty_cnt: Number(sumRow.warranty_cnt),
      charged_amount: Number(sumRow.charged_amount),
      covered_amount: Number(sumRow.covered_amount)
    }
  };
}

function findById(id, deleted) {
  return scope(deleted).where('t.id', id).first(SELECT);
}

function findByNo(ticketNo) {
  return scope(false).where('t.ticket_no', ticketNo).first(SELECT);
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

/** Locked, for the transitions that read a ticket and then write it. */
function lockRow(id, trx) {
  return trx(TABLE).where(PK, id).forUpdate().first();
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

/**
 * The next number for a day, as one statement.
 *
 * Reading the highest and adding one is the classic way to hand two clerks
 * the same ticket number, and the UNIQUE index would then reject whichever of
 * them pressed save second - after they had typed the whole form.  Counting
 * inside the INSERT is not possible here because the number is part of the
 * row, so this at least narrows the window to a single round trip and lets
 * the caller retry on the constraint.
 */
async function nextNumber(prefix, trx) {
  const row = await (trx || db)(TABLE)
    .where('ticket_no', 'like', prefix + '%')
    .first(db.raw('MAX(ticket_no) AS last_no'));

  const last = row && row.last_no ? Number(String(row.last_no).slice(prefix.length)) : 0;
  return prefix + String((isFinite(last) ? last : 0) + 1).padStart(4, '0');
}

/**
 * An earlier visit for the same device, recently enough to be the same fault.
 *
 * This is what makes reopened_from get set, and reopened_from is what the
 * repeat rate in v_agency_health counts.  Matching on the serial rather than
 * on the customer is deliberate: a device sold on, or brought in by a
 * different family member, is still the same device coming back.
 */
function previousVisit(serialNumber, withinDays, exceptId, trx) {
  const qb = (trx || db)(TABLE)
    .where('serial_number', serialNumber)
    .where('is_deleted', false)
    .whereNot('status', 9)
    .whereRaw("received_at >= now() - (? || ' days')::interval", [Number(withinDays) || 30])
    .orderBy('received_at', 'desc');

  if (exceptId) qb.whereNot(PK, exceptId);
  return qb.first('id', 'ticket_no', 'symptom_id', 'received_at', 'closed_at');
}

/** Every visit this device has ever made, for the detail page's history block. */
function historyOfDevice(serialNumber, limit, exceptId) {
  const qb = db(TABLE + ' as t')
    .leftJoin('agencies as g', 'g.id', 't.agency_id')
    .leftJoin('symptom_catalog as sy', 'sy.id', 't.symptom_id')
    .where('t.serial_number', serialNumber)
    .where('t.is_deleted', false)
    .orderBy('t.received_at', 'desc')
    .limit(limit);

  if (exceptId) qb.whereNot('t.id', exceptId);

  return qb.select('t.id', 't.ticket_no', 't.status', 't.is_warranty', 't.total_amount',
    't.received_at', 't.closed_at', 'g.name as agency_name', 'sy.name as symptom_name');
}

/* ------------------------------------------------------------------ */
/*  the bill                                                           */
/* ------------------------------------------------------------------ */

function itemsOf(ticketId, trx) {
  return (trx || db)(ITEMS + ' as i')
    .leftJoin('parts as p', 'p.id', 'i.part_id')
    .where('i.ticket_id', ticketId)
    .orderBy('i.id')
    .select('i.*', 'p.part_no', 'p.component');
}

function findItem(itemId, trx) {
  return (trx || db)(ITEMS).where('id', itemId).first();
}

function insertItem(data, trx) {
  return (trx || db)(ITEMS).insert(data).returning('*');
}

function updateItem(itemId, data, trx) {
  return (trx || db)(ITEMS).where('id', itemId).update(data).returning('*');
}

function removeItem(itemId, trx) {
  return (trx || db)(ITEMS).where('id', itemId).del();
}

/**
 * The three sums the ticket header caches, recomputed from the lines.
 *
 * The header could be kept in step line by line, and would then be wrong the
 * first time a line was edited by anything that forgot to.  Adding four rows
 * up is cheap; a bill that does not match its own lines is not.
 */
function totalsOf(ticketId, trx) {
  return (trx || db)(ITEMS)
    .where('ticket_id', ticketId)
    .first(
      db.raw("COALESCE(SUM(amount) FILTER (WHERE item_type = 'PART' AND is_covered = false), 0) AS parts_amount"),
      db.raw("COALESCE(SUM(amount) FILTER (WHERE item_type <> 'PART' AND is_covered = false), 0) AS labour_amount"),
      db.raw('COALESCE(SUM(amount) FILTER (WHERE is_covered = true), 0) AS covered_amount'),
      db.raw("COALESCE(SUM(amount) FILTER (WHERE item_type = 'PART' AND is_covered = true), 0) AS covered_parts_amount"),
      db.raw("COALESCE(SUM(amount) FILTER (WHERE item_type <> 'PART' AND is_covered = true), 0) AS covered_labour_amount"),
      db.raw('COALESCE(SUM(labour_minutes), 0) AS labour_minutes'),
      db.raw("COUNT(*) FILTER (WHERE item_type = 'PART' AND issued = false) AS unissued_cnt")
    );
}

/* ------------------------------------------------------------------ */
/*  the timeline                                                       */
/* ------------------------------------------------------------------ */

function eventsOf(ticketId, publicOnly) {
  const qb = db(EVENTS + ' as e')
    .leftJoin('technicians as tec', 'tec.id', 'e.technician_id')
    .where('e.ticket_id', ticketId)
    .orderBy('e.created_at')
    .select('e.*', 'tec.name as technician_name');

  if (publicOnly) qb.where('e.is_public', true);
  return qb;
}

function insertEvent(data, trx) {
  return (trx || db)(EVENTS).insert(data).returning('*');
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  ITEMS: ITEMS,
  EVENTS: EVENTS,

  search: search,
  findById: findById,
  findByNo: findByNo,
  findRow: findRow,
  lockRow: lockRow,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  nextNumber: nextNumber,
  previousVisit: previousVisit,
  historyOfDevice: historyOfDevice,

  itemsOf: itemsOf,
  findItem: findItem,
  insertItem: insertItem,
  updateItem: updateItem,
  removeItem: removeItem,
  totalsOf: totalsOf,

  eventsOf: eventsOf,
  insertEvent: insertEvent
};
