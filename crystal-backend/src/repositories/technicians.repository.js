const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'technicians';
const PK = 'id';
const SKILLS = 'technician_skills';

const SEARCHABLE = ['t.name', 't.code', 't.phone'];

function scope(deleted) {
  return db(TABLE + ' as t')
    .join('agencies as a', 'a.id', 't.agency_id')
    .where('t.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.agency_id) qb.where('t.agency_id', filters.agency_id);
  if (filters.status) qb.where('t.status', filters.status);
  if (filters.grade !== undefined && filters.grade !== '') qb.where('t.grade', filters.grade);
  if (filters.component) {
    qb.whereExists(function () {
      this.select(db.raw(1)).from(SKILLS + ' as s')
        .whereRaw('s.technician_id = t.id')
        .where('s.component', filters.component);
    });
  }
  return qb;
}

/**
 * The bench, with today's load on it.
 *
 * `assigned_minutes` counts the bench time already promised to open tickets,
 * against the `daily_minutes` the technician has.  Counting tickets instead
 * would weigh a screen replacement and a firmware reflash the same, which is
 * how a rota ends up looking balanced and being nothing of the sort.
 */
async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb
    .select('t.*', 'a.name as agency_name', 'a.province as agency_province')
    .select(
      db.raw('(SELECT COUNT(*) FROM repair_tickets rt WHERE rt.technician_id = t.id AND rt.is_deleted = false AND rt.status < 7) AS open_cnt'),
      db.raw('COALESCE((SELECT SUM(i.labour_minutes) FROM repair_ticket_items i ' +
             'JOIN repair_tickets rt ON rt.id = i.ticket_id ' +
             'WHERE rt.technician_id = t.id AND rt.is_deleted = false AND rt.status < 7), 0) AS assigned_minutes'),
      db.raw("(SELECT string_agg(s.component, ',' ORDER BY s.component) FROM " + SKILLS + " s WHERE s.technician_id = t.id) AS skills"),
      db.raw('(SELECT ROUND(AVG(rt.rating), 2) FROM repair_tickets rt WHERE rt.technician_id = t.id AND rt.rating IS NOT NULL) AS csat')
    )
    .orderBy('t.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function options(agencyId) {
  const qb = scope(false).where('t.status', 'ACTIVE');
  if (agencyId) qb.where('t.agency_id', agencyId);
  return qb.orderBy('t.name').limit(500)
    .select('t.id', 't.name', 't.code', 't.grade', 't.agency_id', 'a.name as agency_name');
}

function findById(id, deleted) {
  return scope(deleted).where('t.id', id).first('t.*', 'a.name as agency_name');
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

function findByCode(code, exceptId, trx) {
  const qb = (trx || db)(TABLE).whereRaw('lower(code) = lower(?)', [String(code || '').trim()]);
  if (exceptId) qb.whereNot(PK, exceptId);
  return qb.first(PK);
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

/* ---- skills ---- */

function skillsOf(technicianId) {
  return db(SKILLS).where('technician_id', technicianId).orderBy('component')
    .select('id', 'component', 'level');
}

async function replaceSkills(technicianId, skills, trx) {
  await (trx || db)(SKILLS).where('technician_id', technicianId).del();
  if (!skills || !skills.length) return [];
  return (trx || db)(SKILLS).insert(skills.map(function (skill) {
    return {
      technician_id: technicianId,
      component: skill.component,
      level: Math.min(4, Math.max(1, Number(skill.level) || 1))
    };
  })).returning('*');
}

/**
 * Who should get this job.
 *
 * Ordered by skill in the component the symptom blames, then by how little
 * work they already have.  Skill first rather than load first on purpose: the
 * least busy technician is often the one who cannot do the job, and a
 * board-level repair handed to a trainee is how one visit becomes three.
 */
function suggestFor(agencyId, component) {
  return db(TABLE + ' as t')
    .leftJoin(SKILLS + ' as s', function () {
      this.on('s.technician_id', 't.id').andOn('s.component', db.raw('?', [component || '']));
    })
    .where('t.agency_id', agencyId)
    .where('t.status', 'ACTIVE')
    .where('t.is_deleted', false)
    .orderByRaw('COALESCE(s.level, 0) DESC')
    .orderByRaw('(SELECT COUNT(*) FROM repair_tickets rt WHERE rt.technician_id = t.id AND rt.status < 7 AND rt.is_deleted = false) ASC')
    .limit(5)
    .select('t.id', 't.name', 't.code', 't.grade',
      db.raw('COALESCE(s.level, 0) AS skill_level'),
      db.raw('(SELECT COUNT(*) FROM repair_tickets rt WHERE rt.technician_id = t.id AND rt.status < 7 AND rt.is_deleted = false) AS open_cnt'));
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  SKILLS: SKILLS,
  search: search,
  options: options,
  findById: findById,
  findRow: findRow,
  findByCode: findByCode,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  skillsOf: skillsOf,
  replaceSkills: replaceSkills,
  suggestFor: suggestFor
};
