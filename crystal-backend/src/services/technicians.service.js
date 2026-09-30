const repo = require('../repositories/technicians.repository');
const agencies = require('../repositories/agencies.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/service/technicians';
const TABLE = repo.TABLE;

const COLUMNS = ['agency_id', 'code', 'name', 'phone', 'grade', 'daily_minutes', 'hired_on', 'status'];
const SORTABLE = ['id', 'name', 'code', 'grade', 'open_cnt', 'assigned_minutes', 'csat'];
const DEFAULT_SORT = 'name';

function search(filters, paging) {
  return repo.search(filters, paging);
}

function options(agencyId) {
  return repo.options(agencyId);
}

async function detail(id, deleted) {
  const technician = await repo.findById(id, deleted);
  if (!technician) throw new HttpError(404, 'common.notFound');
  const skills = await repo.skillsOf(id);
  return { technician: technician, skills: skills };
}

async function assertCodeFree(code, exceptId) {
  const clash = await repo.findByCode(code, exceptId);
  if (clash) throw new HttpError(409, 'common.duplicatedValue');
}

async function create(body, actor) {
  const data = Object.assign({}, body);
  data.code = String(data.code || '').trim();

  if (!data.code || !data.name) throw new HttpError(400, 'common.valueFailedAValidation');
  if (!data.agency_id) throw new HttpError(400, 'common.aServiceCentreIs');

  const agency = await agencies.findRow(data.agency_id);
  if (!agency) throw new HttpError(404, 'common.notFound');

  await assertCodeFree(data.code, null);

  return transaction(async function (trx) {
    const rows = await repo.insert(data, trx);
    if (body.skills) await repo.replaceSkills(rows[0].id, body.skills, trx);

    audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
    return rows[0];
  });
}

async function update(id, body, actor) {
  const data = Object.assign({}, body);

  if (data.code !== undefined) {
    data.code = String(data.code).trim();
    await assertCodeFree(data.code, id);
  }

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  return transaction(async function (trx) {
    const rows = Object.keys(data).length ? await repo.update(id, data, trx) : [previous];
    if (body.skills) await repo.replaceSkills(id, body.skills, trx);

    audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
    return rows[0];
  });
}

async function remove(id, actor) {
  const previous = await repo.findRow(id);
  const affected = await repo.softDelete(id);
  if (!affected) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length) throw new HttpError(404, 'common.notFound');
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
  restore: restore,
  suggestFor: repo.suggestFor
};
