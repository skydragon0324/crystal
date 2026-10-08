const db = require('../../config/db');
const ledger = require('./ledger');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');
const { searchId } = require('./partyId');

/**
 * REWARD POINTS, every currency in one ledger.
 *
 * The vendor ran seven point histories side by side - activity points,
 * registration points, the soft-point pool for apps, karaoke and media,
 * Crystal's own point_logs, the Eshop prize balance. They are one table here,
 * crm_point_event, but NOT one balance: a point type is a currency, and
 * karaoke points cannot buy an app. So a party has one account per currency,
 * and every screen shows them side by side rather than adding them up.
 */

const PAGE = '/admin/crm/points';

function accountQuery(filters) {
  const qb = db('crm_point_account as account')
    .join('crm_party as party', 'party.party_pk', 'account.party_pk')
    .join('crm_point_type as point_type', 'point_type.point_type_id', 'account.point_type_id');

  if (filters.point_type_id) qb.where('account.point_type_id', filters.point_type_id);
  if (filters.party_pk) qb.where('account.party_pk', filters.party_pk);
  if (filters.nonzero === '1') qb.whereNot('account.balance', 0);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () { this.where('party.display_name', 'ilike', like).orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)]); });
  }
  return qb;
}

async function searchAccounts(filters, paging) {
  const count = await accountQuery(filters).count({ total: '*' }).first();
  const sort = { balance: 'account.balance', lifetime_earned: 'account.lifetime_earned', last_event_at: 'account.last_event_at' }[paging.sort]
    || 'account.point_account_id';
  const rows = await accountQuery(filters)
    .select('account.*', 'party.party_pk', 'party.display_name as party_name', 'party.party_status',
      'point_type.point_type_code', 'point_type.point_type_name', 'point_type.decimal_places')
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);

  const totals = await accountQuery(filters)
    .select(db.raw('COALESCE(SUM(account.balance), 0) AS balance, COALESCE(SUM(account.lifetime_earned), 0) AS earned, COALESCE(SUM(account.lifetime_spent), 0) AS spent'))
    .first();

  return { rows: rows, total: Number(count.total), summary: totals };
}

function eventQuery(filters) {
  const qb = db('crm_point_event as point_event')
    .join('crm_point_account as account', 'account.point_account_id', 'point_event.point_account_id')
    .join('crm_party as party', 'party.party_pk', 'account.party_pk')
    .join('crm_point_type as point_type', 'point_type.point_type_id', 'account.point_type_id')
    .join('crm_point_event_type as event_type', 'event_type.point_event_type_id', 'point_event.point_event_type_id')
    .join('crm_project as project', 'project.project_id', 'point_event.project_id')
    .leftJoin('crm_point_rule as point_rule', 'point_rule.point_rule_id', 'point_event.point_rule_id')
    .leftJoin('managers as manager', 'manager.id', 'point_event.performed_by_manager_id')
    .leftJoin('crm_service_center as center', 'center.service_center_id', 'point_event.performed_by_service_center_id');

  if (filters.point_account_id) qb.where('point_event.point_account_id', filters.point_account_id);
  if (filters.point_type_id) qb.where('account.point_type_id', filters.point_type_id);
  if (filters.point_event_type_id) qb.where('point_event.point_event_type_id', filters.point_event_type_id);
  if (filters.project_id) qb.where('point_event.project_id', filters.project_id);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('party.display_name', 'ilike', like).orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)])
        .orWhere('point_event.description', 'ilike', like);
    });
  }
  return qb;
}

async function searchEvents(filters, paging) {
  const count = await eventQuery(filters).count({ total: '*' }).first();
  const rows = await eventQuery(filters)
    .select('point_event.*', 'party.party_pk', 'party.display_name as party_name', 'point_type.point_type_code',
      'point_type.point_type_name', 'event_type.event_code', 'event_type.display_name as event_name', 'project.project_code',
      'point_rule.rule_code', 'point_rule.rule_name', 'manager.name as manager_name', 'center.service_center_name')
    .orderBy([{ column: 'point_event.occurred_at', order: paging.dir }, { column: 'point_event.point_event_id', order: paging.dir }])
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

/**
 * A MANUAL ADJUSTMENT, the only way a person moves a balance by hand.
 *
 * There is no editing a balance and no deleting an event: an award made in
 * error is corrected by an adjustment that says so, and both stay on the
 * record. The reason is required for the same reason it is on a wallet.
 */
async function adjust(body, actor) {
  if (!body.party_pk || !body.point_type_id) throw new HttpError(400, 'crm.points.customerAndPointTypeAreRequired');
  if (!body.description || !String(body.description).trim()) throw new HttpError(400, 'crm.common.aReasonIsRequired');

  const delta = Number(body.points_delta);
  if (!isFinite(delta) || delta === 0) throw new HttpError(400, 'crm.points.pointsMustNotBeZero');

  const event = await transaction(function (trx) {
    return ledger.post(trx, {
      party_pk: body.party_pk,
      point_type_id: body.point_type_id,
      event_code: 'ADJUST',
      points_delta: delta,
      project_id: body.project_id || null,
      performed_by_manager_id: actor.manager_id,
      description: String(body.description).trim(),
      ip_address: actor.ip || null
    });
  });

  audit.created(actor, 'crm_point_event', event.point_event_id, event, PAGE);
  return event;
}

/** Accounts whose cached balance no longer equals the sum of their ledger. Should be empty. */
function drift() {
  return db('v_crm_point_account_drift as account_drift')
    .join('crm_party as party', 'party.party_pk', 'account_drift.party_pk')
    .join('crm_point_type as point_type', 'point_type.point_type_id', 'account_drift.point_type_id')
    .select('account_drift.*', 'party.party_pk', 'party.display_name as party_name', 'point_type.point_type_code');
}

module.exports = {
  PAGE: PAGE,
  searchAccounts: searchAccounts,
  searchEvents: searchEvents,
  adjust: adjust,
  drift: drift
};
