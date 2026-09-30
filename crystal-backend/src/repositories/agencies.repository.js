const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'agencies';
const PK = 'id';
const SERVICES = 'agency_services';
const PHONES = 'agency_phones';
const PROVINCES = 'provinces';

/**
 * Service centres.
 *
 * Two readers again: the storefront's store locator, which wants an address
 * and a distance, and the console's operations board, which wants a workload.
 * The locator reads `nearest`, `nearestPage`, `publicById` and `provinces`;
 * everything else here is the console's.
 */

/*
 * EVERY NUMBER A CENTRE ANSWERS, as one JSON array on the row -
 * [{ phone, label }], in the centre's own order.
 *
 * A correlated subquery rather than a second round trip per page: the list is
 * twelve or fifty centres at a time, and a card without its numbers is not a
 * card anybody can use. `[]` rather than NULL for a centre with none, so a
 * reader never has to ask which of the two it got.
 */
const PHONES_JSON = '(SELECT COALESCE(json_agg(json_build_object(\'phone\', p.phone, \'label\', p.label) '
  + 'ORDER BY p.sort_order, p.id), \'[]\'::json) FROM ' + PHONES + ' p WHERE p.agency_id = a.id)';

/* The same numbers as one searchable string - "which centre is 400-820-1003?" */
const PHONE_TEXT = '(SELECT string_agg(p.phone, \' \') FROM ' + PHONES + ' p WHERE p.agency_id = a.id)';

/*
 * WHAT A SEARCH LOOKS AT - and the storefront's list is SHORTER.
 *
 * The landmark is searchable in the console, where it is written ("the one by
 * the Grand Theatre") and where staff look for a centre the way a caller
 * describes it. It is NOT searchable on the storefront: a public search box
 * that matched on it would answer "is the landmark of any centre 'Grand
 * Theatre'?" one guess at a time, which is sending the field in instalments.
 */
const PUBLIC_SEARCHABLE = ['a.name', 'a.code', 'a.province', 'a.address', PHONE_TEXT];
const SEARCHABLE = PUBLIC_SEARCHABLE.concat(['a.landmark']);

/*
 * THE COLUMNS A STOREFRONT READ SELECTS, BY NAME - never `a.*`.
 *
 * This list is what keeps the landmark (and the SLA, the capacity, the display
 * order, the audit timestamps) off the public API: a column added to
 * `agencies` reaches the storefront only by being added here, on purpose.
 * scripts/check.js looks for a centre's landmark in every public reply that
 * carries one.
 */
const PUBLIC = ['a.id', 'a.name', 'a.code', 'a.province', 'a.address', 'a.tier'];

/* Computed in the select list, so they are ordered by alias, not as a.column. */
const COMPUTED = ['open_cnt', 'technician_cnt'];

function scope(deleted) {
  return db(TABLE + ' as a').where('a.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.province) qb.where('a.province', filters.province);
  if (filters.status) qb.where('a.status', filters.status);
  if (filters.tier !== undefined && filters.tier !== '') qb.where('a.tier', filters.tier);

  /*
   * SECTION and SERVICE TYPE are one filter, not two.
   *
   * A centre offers REPAIR to smartphone customers and REPAIR to eproduct
   * customers as two separate rows, so asking for `REPAIR` without saying
   * which section would match a centre that only does the other one. When
   * a section is given the EXISTS test carries both.
   */
  if (filters.section || filters.service_type) {
    qb.whereExists(function () {
      const inner = this.select(db.raw(1)).from(SERVICES + ' as s')
        .whereRaw('s.agency_id = a.id');

      if (filters.section) inner.where('s.section', String(filters.section).toUpperCase());
      if (filters.service_type) inner.where('s.service_type', filters.service_type);
    });
  }
  return qb;
}

/*
 * The services as `SECTION:TYPE` pairs, so a list that shows one section can
 * tell which of a shared centre's services are its own. Narrowed to the
 * asked-for section when there is one.
 */
function servicesColumn(section) {
  return db.raw(
    "(SELECT string_agg(s.section || ':' || s.service_type, ',' "
    + "ORDER BY s.section, s.service_type) FROM " + SERVICES + " s "
    + "WHERE s.agency_id = a.id" + (section ? " AND s.section = ?" : "") + ") AS services",
    section ? [String(section).toUpperCase()] : []
  );
}

/**
 * THE DEFAULT ORDER, one definition for the console list and the storefront's.
 *
 *   a.sort_order, NULLS LAST   the display order somebody set. NULL is "not
 *                              placed", and an unplaced centre follows every
 *                              placed one - see the column's comment
 *   the province's position    provinces.sort_order, the same order as the
 *                              province filter above the list
 *   tier, highest first        a flagship before a collection point
 *   name, then id              so two pages never share or skip a row
 *
 * `desc` turns the whole of it round, for the console's column header; the
 * storefront only ever reads it forwards.
 */
function inDisplayOrder(qb, desc) {
  const up = desc ? 'DESC' : 'ASC';
  const down = desc ? 'ASC' : 'DESC';
  const nulls = desc ? 'NULLS FIRST' : 'NULLS LAST';

  return qb
    .leftJoin(PROVINCES + ' as pv', 'pv.name', 'a.province')
    .orderByRaw(
      'a.sort_order ' + up + ' ' + nulls + ', pv.sort_order ' + up + ' ' + nulls
      + ', a.province ' + up + ', a.tier ' + down + ', a.name ' + up + ', a.id ' + up
    );
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = qb.select('a.*')
    .select(
      db.raw('(SELECT COUNT(*) FROM repair_tickets t WHERE t.agency_id = a.id AND t.is_deleted = false AND t.status < 7) AS open_cnt'),
      db.raw('(SELECT COUNT(*) FROM technicians tc WHERE tc.agency_id = a.id AND tc.is_deleted = false) AS technician_cnt'),
      servicesColumn(filters.section),
      db.raw(PHONES_JSON + ' AS phones')
    );

  /*
   * The display order is the DEFAULT sort, and it is the whole chain above -
   * not `ORDER BY sort_order` alone, which would leave a hundred unplaced
   * centres in whatever order the planner liked. Any other column the header
   * asks for still breaks its ties by name, for the same paging reason.
   */
  if (paging.sort === 'sort_order') {
    inDisplayOrder(rows, paging.dir === 'desc');
  } else if (COMPUTED.indexOf(paging.sort) !== -1) {
    rows.orderByRaw('?? ' + (paging.dir === 'desc' ? 'DESC' : 'ASC') + ', a.name ASC', [paging.sort]);
  } else {
    rows.orderBy([{ column: 'a.' + paging.sort, order: paging.dir }, { column: 'a.name' }, { column: 'a.id' }]);
  }

  return { rows: await rows.limit(paging.limit).offset(paging.offset), total: Number(countRow.c) };
}

function options(deleted) {
  return scope(deleted).orderBy('a.name').limit(1000)
    .select('a.id', 'a.name', 'a.code', 'a.province', 'a.tier', 'a.sla_hours');
}

/** The console's read of one centre - everything, landmark included, and its numbers. */
function findById(id, deleted) {
  return scope(deleted).where('a.id', id).first('a.*', db.raw(PHONES_JSON + ' AS phones'));
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

/** Deleted or not, with its numbers - what a save's audit entry records as "before". */
function findWithPhones(id, trx) {
  return (trx || db)(TABLE + ' as a').where('a.' + PK, id).first('a.*', db.raw(PHONES_JSON + ' AS phones'));
}

/**
 * The storefront's read of one centre: the PUBLIC columns and its numbers.
 *
 * This is the read the detail endpoint used to make with `findById` - a.* -
 * which sent the SLA, the capacity and, once it existed, the landmark to any
 * visitor who asked for a centre by id.
 */
function publicById(id) {
  return scope(false).where('a.id', id).where('a.status', 'ACTIVE')
    .first(PUBLIC.concat([db.raw(PHONES_JSON + ' AS phones')]));
}

/**
 * The store locator's read.
 *
 * NOT "nearest" any more, despite the name the callers still use. The
 * distance sort was a flat-earth approximation over `latitude`/`longitude`,
 * and those columns are gone: a centre is an address and its phone numbers,
 * and the province filter above the list is what people actually narrow by.
 *
 * The order is the DISPLAY ORDER - see inDisplayOrder: whatever the console
 * placed first, then the rest by the province order, tier and name. Within a
 * province that is a more useful first result than whichever branch happened
 * to be four hundred metres closer.
 */
function nearest(filters) {
  const qb = scope(false).where('a.status', 'ACTIVE');
  applyFilters(qb, filters);

  qb.select(PUBLIC.concat([servicesColumn(filters.section), db.raw(PHONES_JSON + ' AS phones')]));
  inDisplayOrder(qb, false);

  return qb.limit(filters.limit || 50);
}

/**
 * The same read, PAGED.
 *
 * A hundred centres is more than a page, and a locator that fetches all of
 * them to filter in the browser searches only as far as its own limit -
 * which is how six of them became unreachable.
 */
async function nearestPage(filters, paging) {
  const build = () => applyFilters(scope(false).where('a.status', 'ACTIVE'), filters);

  const countRow = await applySearch(build(), PUBLIC_SEARCHABLE, filters.q)
    .clearSelect().clearOrder().count({ c: '*' }).first();

  const rows = await inDisplayOrder(
    applySearch(build(), PUBLIC_SEARCHABLE, filters.q)
      .select(PUBLIC.concat([servicesColumn(filters.section), db.raw(PHONES_JSON + ' AS phones')])),
    false
  ).limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
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

/* ---- what a centre offers ---- */

/**
 * Everything a centre offers, or just one section's worth.
 *
 * Rows rather than a plucked list of strings, because the section is half
 * the answer: "REPAIR" on its own does not say which counter.
 */
function servicesOf(agencyId, section) {
  const qb = db(SERVICES).where('agency_id', agencyId)
    .orderBy([{ column: 'section' }, { column: 'service_type' }]);

  if (section) qb.where('section', String(section).toUpperCase());
  return qb.select('id', 'section', 'service_type');
}

/**
 * Replaces ONE SECTION's list, and leaves the other alone.
 *
 * This is the whole point of the section column. The console edits the two
 * lists on two pages, run by two different people; a replace that cleared
 * the table would mean saving the smartphone counter silently deleted the
 * eproduct one.
 */
async function replaceServices(agencyId, section, types, trx) {
  const scoped = String(section).toUpperCase();

  await (trx || db)(SERVICES)
    .where({ agency_id: agencyId, section: scoped }).del();

  if (!types || !types.length) return [];

  return (trx || db)(SERVICES).insert(types.map(function (type) {
    return { agency_id: agencyId, section: scoped, service_type: type };
  })).returning('*');
}

/* ---- its phone numbers ---- */

/**
 * Replaces a centre's numbers with THIS LIST, in this order.
 *
 * The whole list rather than a diff, like the attachments beside a price: the
 * console edits it as one list - add, remove, move up - and what is on screen
 * when Save is pressed is exactly what is stored. Order is the position in
 * the array, in steps of ten. The phones are already checked and de-duplicated
 * by the service; see assertPhones.
 */
async function replacePhones(agencyId, phones, trx) {
  await (trx || db)(PHONES).where('agency_id', agencyId).del();

  if (!phones || !phones.length) return [];

  return (trx || db)(PHONES).insert(phones.map(function (entry, index) {
    return {
      agency_id: agencyId,
      phone: entry.phone,
      label: entry.label || null,
      sort_order: (index + 1) * 10
    };
  })).returning('*');
}

/* ---- provinces ---- */

/**
 * The provinces that actually have a centre, for the locator's first
 * dropdown - IN THE ORDER SET ON /admin/support/provinces.
 *
 * Built from the centres and only ORDERED by the master, so a province with
 * nothing live in it is not offered (a choice that can only answer "none"),
 * and a centre always reaches its own province's entry, whatever happens to
 * the master row. `section` counts only the centres serving that counter: the
 * eproduct page should not offer a province whose only centre is a
 * smartphone collection point.
 */
function provinces(filters) {
  const f = filters || {};
  const qb = db(TABLE + ' as a')
    .leftJoin(PROVINCES + ' as pv', 'pv.name', 'a.province')
    .where({ 'a.is_deleted': false, 'a.status': 'ACTIVE' })
    .groupBy('a.province', 'pv.sort_order')
    .orderByRaw('pv.sort_order ASC NULLS LAST, a.province ASC')
    .select('a.province', db.raw('COUNT(*) AS agency_cnt'));

  if (f.section) applyFilters(qb, { section: f.section });
  return qb;
}

/**
 * EVERY PROVINCE A CENTRE MAY BE FILED UNDER, for the console's form - the
 * master list, in its order, empty ones included: a centre opening in a new
 * province is exactly the case where it has none yet.
 */
function provinceOptions() {
  return db(PROVINCES + ' as pv')
    .where('pv.is_deleted', false)
    .orderBy([{ column: 'pv.sort_order' }, { column: 'pv.name' }])
    .select('pv.id', 'pv.name as province', 'pv.sort_order', db.raw(
      '(SELECT COUNT(*) FROM agencies a WHERE a.province = pv.name '
      + 'AND a.is_deleted = false AND a.status = \'ACTIVE\') AS agency_cnt'
    ));
}

function provinceExists(name, trx) {
  return (trx || db)(PROVINCES).where('name', name).first('id');
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  SERVICES: SERVICES,
  PHONES: PHONES,
  PUBLIC: PUBLIC,
  search: search,
  options: options,
  findById: findById,
  findRow: findRow,
  findWithPhones: findWithPhones,
  publicById: publicById,
  nearest: nearest,
  nearestPage: nearestPage,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  servicesOf: servicesOf,
  replaceServices: replaceServices,
  replacePhones: replacePhones,
  provinces: provinces,
  provinceOptions: provinceOptions,
  provinceExists: provinceExists
};
