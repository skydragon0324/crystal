const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/**
 * WHO LOOKS AFTER A CUSTOMER, AND ON WHAT TERMS.
 *
 * The account team is one manager per role - account manager, sales rep,
 * support manager. Naming a new one for a role ends the previous one's turn
 * rather than overwriting it, so the record shows who looked after the
 * customer when.
 *
 * Agreements are the contracts with a customer - an enterprise agreement, a
 * reseller contract, a service level. The one in force is shown on the record;
 * the earlier ones stay for the history.
 */

const PAGE = '/admin/crm/customers';
const ROLES = ['ACCOUNT_MANAGER', 'SALES_REP', 'SUPPORT_MANAGER'];
const AGREEMENT_TYPES = ['ENTERPRISE', 'RESELLER', 'DISTRIBUTION', 'SERVICE_LEVEL', 'PURCHASE', 'PARTNERSHIP'];
const AGREEMENT_STATUS = ['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'];

async function requireParty(id) {
  const party = await db('crm_party').where('party_pk', id).first('party_pk');
  if (!party) throw new HttpError(404, 'common.notFound');
  return party;
}

function team(partyId) {
  return db('crm_party_team_member as team_member').join('managers as manager', 'manager.id', 'team_member.manager_id')
    .leftJoin('managers as assigned_by', 'assigned_by.id', 'team_member.assigned_by_manager_id')
    .where('team_member.party_pk', partyId).orderBy([{ column: 'team_member.ended_at', order: 'desc' }, { column: 'team_member.assigned_at', order: 'desc' }])
    .select('team_member.*', 'manager.name as manager_name', 'manager.username', 'assigned_by.name as assigned_by_name');
}

async function assign(partyId, body, actor) {
  await requireParty(partyId);
  if (ROLES.indexOf(body.team_role) === -1) throw new HttpError(400, 'crm.customers.chooseATeamRole');
  const manager = await db('managers').where({ id: body.manager_id || null, is_deleted: false }).first('id', 'status');
  if (!manager) throw new HttpError(400, 'crm.customers.chooseAStaffMember');

  const row = await transaction(async function (trx) {
    const current = await trx('crm_party_team_member').where({ party_pk: partyId, team_role: body.team_role }).whereNull('ended_at').forUpdate().first();
    if (current && current.manager_id === manager.id) throw new HttpError(409, 'crm.customers.theyAlreadyHaveThatRole');
    if (current) await trx('crm_party_team_member').where('team_member_id', current.team_member_id).update({ ended_at: trx.fn.now() });
    const [created] = await trx('crm_party_team_member').insert({
      party_pk: partyId, manager_id: manager.id, team_role: body.team_role, assigned_by_manager_id: actor.manager_id
    }).returning('*');
    return created;
  });
  audit.created(actor, 'crm_party_team_member', row.team_member_id, row, PAGE);
  return row;
}

async function endAssignment(partyId, teamMemberId, actor) {
  const [row] = await db('crm_party_team_member').where({ team_member_id: teamMemberId, party_pk: partyId }).whereNull('ended_at')
    .update({ ended_at: db.fn.now() }).returning('*');
  if (!row) throw new HttpError(404, 'common.notFound');
  audit.updated(actor, 'crm_party_team_member', teamMemberId, null, row, PAGE);
  return row;
}

/* ------------------------------------------------------------ agreements */

function agreements(partyId) {
  return db('crm_party_agreement as agreement').leftJoin('managers as manager', 'manager.id', 'agreement.created_by_manager_id')
    .where('agreement.party_pk', partyId).orderBy('agreement.start_date', 'desc').select('agreement.*', 'manager.name as created_by_name');
}

async function saveAgreement(partyId, agreementId, body, actor) {
  await requireParty(partyId);
  const data = {};
  ['agreement_no', 'agreement_type', 'title', 'start_date', 'end_date', 'renewal_date', 'status', 'annual_value', 'currency_code', 'note']
    .forEach(function (column) { if (body[column] !== undefined) data[column] = body[column] === '' ? null : body[column]; });
  if (data.agreement_type !== undefined && AGREEMENT_TYPES.indexOf(data.agreement_type) === -1) throw new HttpError(400, 'crm.customers.chooseAnAgreementType');
  if (data.status !== undefined && AGREEMENT_STATUS.indexOf(data.status) === -1) throw new HttpError(400, 'crm.common.notAStatusYouCanSet');
  if (data.annual_value !== undefined && data.annual_value !== null && !data.currency_code) data.currency_code = 'USD';

  if (agreementId) {
    const before = await db('crm_party_agreement').where({ agreement_id: agreementId, party_pk: partyId }).first();
    if (!before) throw new HttpError(404, 'common.notFound');
    const merged = Object.assign({}, before, data);
    if (merged.end_date && new Date(merged.end_date) < new Date(merged.start_date)) throw new HttpError(400, 'crm.customers.itCannotEndBeforeItStarts');
    const [after] = await db('crm_party_agreement').where('agreement_id', agreementId)
      .update(Object.assign(data, { updated_at: db.fn.now() })).returning('*');
    audit.updated(actor, 'crm_party_agreement', agreementId, before, after, PAGE);
    return after;
  }

  if (!data.agreement_type || !data.start_date) throw new HttpError(400, 'crm.customers.typeAndStartAreRequired');
  if (data.end_date && new Date(data.end_date) < new Date(data.start_date)) throw new HttpError(400, 'crm.customers.itCannotEndBeforeItStarts');
  const [row] = await db('crm_party_agreement').insert(Object.assign({ party_pk: partyId, created_by_manager_id: actor.manager_id }, data)).returning('*');
  audit.created(actor, 'crm_party_agreement', row.agreement_id, row, PAGE);
  return row;
}

module.exports = {
  ROLES: ROLES,
  AGREEMENT_TYPES: AGREEMENT_TYPES,
  team: team,
  assign: assign,
  endAssignment: endAssignment,
  agreements: agreements,
  saveAgreement: saveAgreement
};
