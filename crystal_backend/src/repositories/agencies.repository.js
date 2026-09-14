const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'agencies';
const PK = 'id';
const SERVICES = 'agency_services';

/**
 * Service centres.
 *
 * Two readers again: the storefront's store locator, which wants an address
 * and a distance, and the console's operations board, which wants a workload.
 * The locator reads `nearest` and `published`; everything else here is the
 * console's.
 */

const SEARCHABLE = ['a.name', 'a.code', 'a.province', 'a.address'];

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

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('a.*')
    .select(
      db.raw('(SELECT COUNT(*) FROM repair_tickets t WHERE t.agency_id = a.id AND t.is_deleted = false AND t.status < 7) AS open_cnt'),
      db.raw('(SELECT COUNT(*) FROM technicians tc WHERE tc.agency_id = a.id AND tc.is_deleted = false) AS technician_cnt'),
      /*
       * The services as `SECTION:TYPE` pairs, so a console list that shows
       * one section can tell which of a shared centre's services are its
       * own. Narrowed to the asked-for section when there is one.
       */
      db.raw(
        "(SELECT string_agg(s.section || ':' || s.service_type, ',' "
        + "ORDER BY s.section, s.service_type) FROM " + SERVICES + " s "
        + "WHERE s.agency_id = a.id" + (filters.section ? " AND s.section = ?" : "") + ") AS services",
        filters.section ? [String(filters.section).toUpperCase()] : []
      )
    )
    .orderBy('a.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function options(deleted) {
  return scope(deleted).orderBy('a.name').limit(1000)
    .select('a.id', 'a.name', 'a.code', 'a.province', 'a.tier', 'a.sla_hours');
}

function findById(id, deleted) {
  return scope(deleted).where('a.id', id).first('a.*');
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

/**
 * The store locator's read.
 *
 * NOT "nearest" any more, despite the name the callers still use. The
 * distance sort was a flat-earth approximation over `latitude`/`longitude`,
 * and those columns are gone: a centre is an address and a phone number, and
 * the province filter above the list is what people actually narrow by.
 *
 * So the order is province, then TIER descending - a flagship before a
 * collection point - then name. Within a province that is a more useful
 * first result than whichever branch happened to be four hundred metres
 * closer.
 */
function nearest(filters) {
  const qb = scope(false).where('a.status', 'ACTIVE');
  applyFilters(qb, filters);

  qb.select('a.id', 'a.name', 'a.code', 'a.province', 'a.address', 'a.phone', 'a.tier',
    db.raw(
      "(SELECT string_agg(s.section || ':' || s.service_type, ',' "
      + "ORDER BY s.section, s.service_type) FROM " + SERVICES + " s "
      + "WHERE s.agency_id = a.id" + (filters.section ? " AND s.section = ?" : "") + ") AS services",
      filters.section ? [String(filters.section).toUpperCase()] : []
    ));

  qb.orderBy([{ column: 'a.province' }, { column: 'a.tier', order: 'desc' }, { column: 'a.name' }]);

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

  const countRow = await applySearch(build(), SEARCHABLE, filters.q)
    .clearSelect().clearOrder().count({ c: '*' }).first();

  const rows = await applySearch(build(), SEARCHABLE, filters.q)
    .select('a.id', 'a.name', 'a.code', 'a.province', 'a.address', 'a.phone', 'a.tier',
      db.raw(
        "(SELECT string_agg(s.section || ':' || s.service_type, ',' "
        + "ORDER BY s.section, s.service_type) FROM " + SERVICES + " s "
        + "WHERE s.agency_id = a.id" + (filters.section ? " AND s.section = ?" : "") + ") AS services",
        filters.section ? [String(filters.section).toUpperCase()] : []
      ))
    .orderBy([{ column: 'a.province' }, { column: 'a.tier', order: 'desc' }, { column: 'a.name' }])
    .limit(paging.limit).offset(paging.offset);

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

/** The provinces that actually have a centre, for the locator's first dropdown. */
function provinces() {
  return db(TABLE)
    .where({ is_deleted: false, status: 'ACTIVE' })
    .groupBy('province')
    .orderBy('province')
    .select('province', db.raw('COUNT(*) AS agency_cnt'));
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  SERVICES: SERVICES,
  search: search,
  options: options,
  findById: findById,
  findRow: findRow,
  nearest: nearest,
  nearestPage: nearestPage,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  servicesOf: servicesOf,
  replaceServices: replaceServices,
  provinces: provinces
};
