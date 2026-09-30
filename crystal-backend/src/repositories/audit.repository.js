const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'audit_log';

const SEARCHABLE = ['a.entity', 'a.entity_pk', 'a.manager_login', 'a.manager_name', 'a.path'];

function scope() {
  return db(TABLE + ' as a');
}

function applyFilters(qb, filters) {
  if (filters.entity) qb.where('a.entity', filters.entity);
  if (filters.entity_pk) qb.where('a.entity_pk', String(filters.entity_pk));
  if (filters.action) qb.where('a.action', filters.action);
  if (filters.manager_id) qb.where('a.manager_id', filters.manager_id);
  if (filters.from) qb.where('a.created_at', '>=', filters.from);
  // An inclusive end date: a filter to the 20th has to include the 20th, and
  // a timestamp on that day is greater than the date itself.
  if (filters.to) qb.whereRaw('a.created_at < (?::date + interval \'1 day\')', [filters.to]);
  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('a.*')
    .orderBy('a.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function insert(entry) {
  return db(TABLE).insert(entry);
}

/** One record's whole history, oldest last - the shape a timeline is drawn in. */
function historyOf(entity, entityPk, limit) {
  return db(TABLE)
    .where({ entity: entity, entity_pk: String(entityPk) })
    .orderBy('created_at', 'desc')
    .limit(limit);
}

/** The entity names actually present, for the filter dropdown. */
function distinctEntities() {
  return db(TABLE).distinct('entity').orderBy('entity').pluck('entity');
}

/**
 * The people who have actually written something.
 *
 * Read off the trail rather than off `managers`, deliberately: a filter listing
 * every administrator who has never made a change is a filter of mostly empty
 * options, and one who has since been deleted still has entries to find.
 */
function distinctAdmins() {
  return db(TABLE)
    .distinct('manager_id', 'manager_login', 'manager_name')
    .whereNotNull('manager_id')
    .orderBy('manager_name');
}

module.exports = {
  TABLE: TABLE,
  search: search,
  insert: insert,
  historyOf: historyOf,
  distinctEntities: distinctEntities,
  distinctAdmins: distinctAdmins
};
