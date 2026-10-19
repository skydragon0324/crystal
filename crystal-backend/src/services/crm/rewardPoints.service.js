const ExcelJS = require('exceljs');
const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');
const { translateMessage } = require('../../i18n');

const PAGE = '/admin/crm/points';
/* One push or one sheet carries at most this many rows. */
const MAX_ROWS = 5000;
/* A system's clock may run a little ahead of ours; further ahead is a mistake. */
const FUTURE_SLACK_MS = 10 * 60 * 1000;

/**
 * REWARD POINTS PER BUSINESS SYSTEM (crm_reward_points).
 *
 * Every business system runs its own reward points by its own rules. The CRM
 * keeps one figure per business-system account linked to a customer - the
 * points that account holds there - and nothing about how they were earned
 * or spent. A customer with two accounts in one system has two rows.
 *
 * The company-wide score is never stored: it is each row's points times its
 * project's point_weight, summed (v_crm_party_company_points). A project
 * without a weight is shown but not counted.
 *
 * Rows are entered by hand on the customer for now. A business system can
 * send them (POST /api/integration/crm/reward-points) and a sheet can load
 * them; both go through storeMany(), where a figure OLDER than the stored one
 * (by as_of) is ignored as STALE, so a late push cannot undo a newer one.
 */

function parsePoints(value) {
  if (value === null || value === undefined || String(value).trim() === '') return { error: 'crm.rewardPoints.pointsAreRequired' };
  const text = String(value).trim().replace(/[\s,]/g, '');
  if (!/^-?\d{1,16}(\.\d{1,4})?$/.test(text)) return { error: 'crm.rewardPoints.pointsMustBeANumber' };
  return { value: text };
}

function parseAsOf(value) {
  if (value === null || value === undefined || String(value).trim() === '') return { value: new Date() };
  const date = value instanceof Date ? value : new Date(String(value).trim());
  if (isNaN(date.getTime())) return { error: 'crm.rewardPoints.asOfIsNotATime' };
  if (date.getTime() > Date.now() + FUTURE_SLACK_MS) return { error: 'crm.rewardPoints.asOfIsInTheFuture' };
  return { value: date };
}

function noteOf(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text ? text.slice(0, 500) : null;
}

/* ------------------------------------------------------------ one customer */

/** A customer's rows: the system, the account, the points, the weight and what they count for company-wide. */
function rowsOf(partyPk) {
  return db('crm_reward_points as reward')
    .join('crm_project_account as account', 'account.project_account_id', 'reward.project_account_id')
    .join('crm_project as project', 'project.project_id', 'account.project_id')
    .where('account.party_pk', partyPk).whereNull('account.unlinked_at')
    .orderBy([{ column: 'project.project_id' }, { column: 'account.external_account_id' }])
    .select('reward.reward_points_id', 'reward.project_account_id', 'project.project_id', 'project.project_code', 'project.project_name',
      'account.external_account_id', 'account.external_account_pk', 'account.matched_phone', 'reward.points', 'reward.as_of', 'reward.source', 'reward.note', 'reward.updated_at',
      'project.point_weight', db.raw('ROUND(reward.points * project.point_weight, 4) AS company_points'));
}

/** The company-wide score of one customer, worked out now, with the rows it comes from. */
async function ofParty(partyPk) {
  const [rows, total] = await Promise.all([
    rowsOf(partyPk),
    db('v_crm_party_company_points').where('party_pk', partyPk).first()
  ]);
  return {
    company_points: total ? total.company_points : '0',
    counted_systems: total ? Number(total.counted_systems) : 0,
    uncounted_systems: total ? Number(total.uncounted_systems) : 0,
    rows: rows
  };
}

/** The customer's live account the row is for, locked; 404 when it is not theirs or not linked. */
async function accountOf(trx, partyPk, projectAccountId) {
  if (!/^[1-9][0-9]*$/.test(String(projectAccountId || ''))) {
    throw new HttpError(400, 'crm.common.checkTheDetails', [{ field: 'project_account_id', message: 'crm.rewardPoints.chooseAnAccount' }]);
  }
  const account = await trx('crm_project_account').where({ project_account_id: projectAccountId, party_pk: partyPk })
    .whereNull('unlinked_at').forUpdate().first('project_account_id', 'project_id', 'external_account_id');
  if (!account) throw new HttpError(404, 'common.notFound');
  return account;
}

function checked(body) {
  const points = parsePoints((body || {}).points);
  const asOf = parseAsOf((body || {}).as_of);
  const problems = [];
  if (points.error) problems.push({ field: 'points', message: points.error });
  if (asOf.error) problems.push({ field: 'as_of', message: asOf.error });
  if (problems.length) throw new HttpError(400, 'crm.common.checkTheDetails', problems);
  const values = { points: points.value, as_of: asOf.value };
  // A note is changed only when one is sent: correcting the points keeps the note that explains them.
  if (body && Object.prototype.hasOwnProperty.call(body, 'note')) values.note = noteOf(body.note);
  return values;
}

/** An administrator adds the points of one of the customer's accounts. */
async function create(partyPk, body, actor) {
  const values = checked(body);
  return transaction(async function (trx) {
    const account = await accountOf(trx, partyPk, (body || {}).project_account_id);
    const taken = await trx('crm_reward_points').where('project_account_id', account.project_account_id).first('reward_points_id');
    if (taken) throw new HttpError(409, 'crm.rewardPoints.accountAlreadyHasPoints');
    const [row] = await trx('crm_reward_points').insert(Object.assign({
      project_account_id: account.project_account_id, source: 'MANUAL', updated_by_manager_id: (actor && actor.manager_id) || null
    }, values)).returning('*');
    audit.created(actor, 'crm_reward_points', row.reward_points_id, row, PAGE);
    return row;
  });
}

async function findOwn(trx, partyPk, id) {
  const row = /^[1-9][0-9]*$/.test(String(id || '')) ? await trx('crm_reward_points as reward')
    .join('crm_project_account as account', 'account.project_account_id', 'reward.project_account_id')
    .where({ 'reward.reward_points_id': id, 'account.party_pk': partyPk }).forUpdate('reward').first('reward.*') : null;
  if (!row) throw new HttpError(404, 'common.notFound');
  return row;
}

/** An administrator corrects a row: the figure entered by hand replaces whatever came before. */
async function update(partyPk, id, body, actor) {
  const values = checked(body);
  return transaction(async function (trx) {
    const before = await findOwn(trx, partyPk, id);
    const [after] = await trx('crm_reward_points').where('reward_points_id', before.reward_points_id)
      .update(Object.assign({ source: 'MANUAL', updated_by_manager_id: (actor && actor.manager_id) || null, updated_at: trx.fn.now() }, values))
      .returning('*');
    audit.updated(actor, 'crm_reward_points', after.reward_points_id, before, after, PAGE);
    return after;
  });
}

async function remove(partyPk, id, actor) {
  return transaction(async function (trx) {
    const before = await findOwn(trx, partyPk, id);
    await trx('crm_reward_points').where('reward_points_id', before.reward_points_id).del();
    audit.deleted(actor, 'crm_reward_points', before.reward_points_id, before, PAGE);
    return { reward_points_id: before.reward_points_id };
  });
}

/* ------------------------------------------------------------ many at once: a system's push, a sheet */

/**
 * Many figures for accounts of known projects, each { project_id,
 * external_account_id, points, as_of?, row? }. Every item is answered - UPDATED,
 * UNCHANGED, STALE, UNKNOWN_ACCOUNT or INVALID with its reason - and nothing
 * fails the batch as a whole.
 */
async function storeMany(items, source, actor) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'crm.rewardPoints.nothingSent');
  if (items.length > MAX_ROWS) throw new HttpError(400, 'crm.rewardPoints.tooManyRows', null, { max: MAX_ROWS });
  const summary = { received: items.length, updated: 0, unchanged: 0, stale: 0, unknown_accounts: 0, invalid: 0, problems: [] };
  const note = function (item, status, message) {
    summary.problems.push({ row: item.row, external_account_id: item.external_account_id == null ? null : String(item.external_account_id), status: status, message: message || null });
  };

  await transaction(async function (trx) {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const login = String(item.external_account_id == null ? '' : item.external_account_id).trim();
      const points = parsePoints(item.points);
      const asOf = parseAsOf(item.as_of);
      if (!login || !item.project_id) { summary.invalid += 1; note(item, 'INVALID', 'crm.rewardPoints.accountIdIsRequired'); continue; }
      if (points.error || asOf.error) { summary.invalid += 1; note(item, 'INVALID', points.error || asOf.error); continue; }
      // eslint-disable-next-line no-await-in-loop
      const account = await trx('crm_project_account').where({ project_id: item.project_id, external_account_id: login })
        .whereNull('unlinked_at').first('project_account_id');
      if (!account) { summary.unknown_accounts += 1; note(item, 'UNKNOWN_ACCOUNT', 'crm.rewardPoints.noSuchAccount'); continue; }
      // eslint-disable-next-line no-await-in-loop
      const before = await trx('crm_reward_points').where('project_account_id', account.project_account_id).forUpdate().first();
      if (before && new Date(before.as_of).getTime() > asOf.value.getTime()) { summary.stale += 1; note(item, 'STALE', 'crm.rewardPoints.olderThanStored'); continue; }
      if (before && Number(before.points) === Number(points.value) && new Date(before.as_of).getTime() === asOf.value.getTime()) { summary.unchanged += 1; continue; }
      const values = { points: points.value, as_of: asOf.value, source: source, updated_by_manager_id: (actor && actor.manager_id) || null, updated_at: trx.fn.now() };
      if (before) {
        // eslint-disable-next-line no-await-in-loop
        const [after] = await trx('crm_reward_points').where('reward_points_id', before.reward_points_id).update(values).returning('*');
        // A system may send thousands a day and every row carries its source and time; people's sheets are audited.
        if (source !== 'API') audit.updated(actor, 'crm_reward_points', after.reward_points_id, before, after, PAGE);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const [row] = await trx('crm_reward_points').insert(Object.assign({ project_account_id: account.project_account_id }, values)).returning('*');
        if (source !== 'API') audit.created(actor, 'crm_reward_points', row.reward_points_id, row, PAGE);
      }
      summary.updated += 1;
    }
  });
  return summary;
}

/** A business system's push: its own accounts only - the project is the API key's. */
function reportFromProject(projectId, body) {
  const list = Array.isArray(body) ? body : (body && body.accounts);
  if (!Array.isArray(list)) throw new HttpError(400, 'crm.rewardPoints.nothingSent');
  return storeMany(list.map(function (item, index) {
    return { row: index + 1, project_id: projectId, external_account_id: item && item.external_account_id, points: item && item.points, as_of: item && item.as_of };
  }), 'API', null);
}

/* The sheet's columns; headers are matched without case, spaces or underscores. */
const COLUMNS = [
  { key: 'project', header: 'Project code', aliases: ['project'] },
  { key: 'external_account_id', header: 'Account ID', aliases: ['external_account_id', 'login'] },
  { key: 'points', header: 'Points', aliases: ['balance', 'reward points'] },
  { key: 'as_of', header: 'As of', aliases: ['as_of', 'date'] }
];

function normaliseHeader(text) {
  return String(text === null || text === undefined ? '' : text).toLowerCase().replace(/[\s_*\-]+/g, '');
}

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map(function (part) { return part.text; }).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return cellValue(value.result);
  }
  return typeof value === 'number' ? value : String(value).trim();
}

/** A sheet of Project code, Account ID, Points and (optionally) As of. */
async function importSheet(buffer, actor) {
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer); } catch (err) { throw new HttpError(400, 'crm.common.thisIsNotAnExcelFile'); }
  const sheet = book.worksheets[0];
  if (!sheet) throw new HttpError(400, 'crm.customerImport.theFileHasNoSheet');

  const positions = {};
  sheet.getRow(1).eachCell(function (cell, position) {
    const header = normaliseHeader(cellValue(cell.value));
    COLUMNS.forEach(function (column) {
      const names = [column.header].concat(column.aliases).map(normaliseHeader);
      if (names.indexOf(header) !== -1 && positions[column.key] === undefined) positions[column.key] = position;
    });
  });
  const missing = COLUMNS.filter(function (column) { return column.key !== 'as_of' && positions[column.key] === undefined; });
  if (missing.length) throw new HttpError(400, 'crm.customerImport.requiredColumnsAreMissing', missing.map(function (column) { return column.header; }));

  const projects = await db('crm_project').select('project_id', 'project_code');
  const byCode = {};
  projects.forEach(function (project) { byCode[String(project.project_code).toUpperCase()] = project.project_id; });

  const items = [];
  const unknownProjects = [];
  sheet.eachRow({ includeEmpty: false }, function (row, number) {
    if (number === 1) return;
    const cells = {};
    COLUMNS.forEach(function (column) { cells[column.key] = positions[column.key] === undefined ? '' : cellValue(row.getCell(positions[column.key]).value); });
    if (COLUMNS.every(function (column) { return cells[column.key] === ''; })) return;
    const projectId = byCode[String(cells.project).toUpperCase()];
    if (!projectId) { unknownProjects.push({ row: number, external_account_id: String(cells.external_account_id), status: 'INVALID', message: 'crm.rewardPoints.noSuchProject' }); return; }
    items.push({ row: number, project_id: projectId, external_account_id: cells.external_account_id, points: cells.points, as_of: cells.as_of === '' ? null : cells.as_of });
  });
  if (!items.length && !unknownProjects.length) throw new HttpError(400, 'crm.customerImport.theFileHasNoRows');

  const summary = items.length
    ? await storeMany(items, 'IMPORT', actor)
    : { received: 0, updated: 0, unchanged: 0, stale: 0, unknown_accounts: 0, invalid: 0, problems: [] };
  summary.received += unknownProjects.length;
  summary.invalid += unknownProjects.length;
  summary.problems = unknownProjects.concat(summary.problems).sort(function (a, b) { return (a.row || 0) - (b.row || 0); });
  return summary;
}

async function template() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Reward points');
  sheet.columns = COLUMNS.map(function (column) { return { header: column.header, key: column.key, width: 22 }; });
  sheet.getRow(1).font = { bold: true };
  const example = await db('crm_project_account as account').join('crm_project as project', 'project.project_id', 'account.project_id')
    .whereNull('account.unlinked_at').first('project.project_code', 'account.external_account_id');
  if (example) sheet.addRow({ project: example.project_code, external_account_id: example.external_account_id, points: 1200, as_of: new Date().toISOString().slice(0, 10) });
  return book.xlsx.writeBuffer();
}

/** A summary's reasons are addresses; read them in the caller's language. */
function translated(summary, locale) {
  return Object.assign({}, summary, {
    problems: summary.problems.map(function (item) { return Object.assign({}, item, { message: item.message ? translateMessage(locale, item.message) : null }); })
  });
}

/* ------------------------------------------------------------ the Points page */

/** One row per customer who has points anywhere: their company-wide score, worked out now. */
async function searchCustomers(filters, paging) {
  const base = db('v_crm_party_company_points as total').join('crm_party as party', 'party.party_pk', 'total.party_pk');
  if (filters.project_id) {
    base.whereExists(function () {
      this.select(db.raw(1)).from('crm_reward_points as reward')
        .join('crm_project_account as account', 'account.project_account_id', 'reward.project_account_id')
        .whereRaw('account.party_pk = total.party_pk').whereNull('account.unlinked_at').where('account.project_id', filters.project_id);
    });
  }
  if (filters.q) {
    const text = String(filters.q).trim();
    base.where(function () {
      this.whereILike('party.display_name', '%' + text + '%').orWhereRaw('party.party_pk::text = ?', [text])
        .orWhereExists(function () {
          this.select(db.raw(1)).from('crm_project_account as account').whereRaw('account.party_pk = total.party_pk')
            .whereNull('account.unlinked_at').whereILike('account.external_account_id', '%' + text + '%');
        });
    });
  }
  const [count, rows] = await Promise.all([
    base.clone().count({ total: '*' }).first(),
    base.clone().select('total.party_pk', 'party.display_name', 'total.company_points', 'total.counted_systems', 'total.uncounted_systems')
      .orderBy(paging.sort === 'display_name' ? 'party.display_name' : 'total.company_points', paging.dir || 'desc')
      .orderBy('total.party_pk').limit(paging.limit).offset(paging.offset)
  ]);
  return { total: Number(count.total), rows: rows };
}

module.exports = {
  ofParty, rowsOf, create, update, remove, storeMany, reportFromProject, importSheet, template, translated, searchCustomers, MAX_ROWS
};
