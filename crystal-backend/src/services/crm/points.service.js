const db = require('../../config/db');
const ledger = require('./ledger');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

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
  const qb = db('crm_point_account as a')
    .join('crm_party as p', 'p.party_id', 'a.party_id')
    .join('crm_point_type as t', 't.point_type_id', 'a.point_type_id');

  if (filters.point_type_id) qb.where('a.point_type_id', filters.point_type_id);
  if (filters.party_id) qb.where('a.party_id', filters.party_id);
  if (filters.nonzero === '1') qb.whereNot('a.balance', 0);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () { this.where('p.display_name', 'ilike', like).orWhere('p.party_no', 'ilike', like); });
  }
  return qb;
}

async function searchAccounts(filters, paging) {
  const count = await accountQuery(filters).count({ c: '*' }).first();
  const sort = { balance: 'a.balance', lifetime_earned: 'a.lifetime_earned', last_event_at: 'a.last_event_at' }[paging.sort]
    || 'a.point_account_id';
  const rows = await accountQuery(filters)
    .select('a.*', 'p.party_no', 'p.display_name as party_name', 'p.party_status',
      't.point_type_code', 't.point_type_name', 't.decimal_places')
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);

  const totals = await accountQuery(filters)
    .select(db.raw('COALESCE(SUM(a.balance), 0) AS balance, COALESCE(SUM(a.lifetime_earned), 0) AS earned, COALESCE(SUM(a.lifetime_spent), 0) AS spent'))
    .first();

  return { rows: rows, total: Number(count.c), summary: totals };
}

function eventQuery(filters) {
  const qb = db('crm_point_event as e')
    .join('crm_point_account as a', 'a.point_account_id', 'e.point_account_id')
    .join('crm_party as p', 'p.party_id', 'a.party_id')
    .join('crm_point_type as t', 't.point_type_id', 'a.point_type_id')
    .join('crm_point_event_type as et', 'et.point_event_type_id', 'e.point_event_type_id')
    .join('crm_project as j', 'j.project_id', 'e.project_id')
    .leftJoin('crm_point_rule as r', 'r.point_rule_id', 'e.point_rule_id')
    .leftJoin('managers as m', 'm.id', 'e.performed_by_manager_id')
    .leftJoin('crm_service_location as l', 'l.service_location_id', 'e.performed_by_location_id');

  if (filters.point_account_id) qb.where('e.point_account_id', filters.point_account_id);
  if (filters.point_type_id) qb.where('a.point_type_id', filters.point_type_id);
  if (filters.point_event_type_id) qb.where('e.point_event_type_id', filters.point_event_type_id);
  if (filters.project_id) qb.where('e.project_id', filters.project_id);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('p.display_name', 'ilike', like).orWhere('p.party_no', 'ilike', like)
        .orWhere('e.description', 'ilike', like);
    });
  }
  return qb;
}

async function searchEvents(filters, paging) {
  const count = await eventQuery(filters).count({ c: '*' }).first();
  const rows = await eventQuery(filters)
    .select('e.*', 'p.party_id', 'p.party_no', 'p.display_name as party_name', 't.point_type_code',
      't.point_type_name', 'et.event_code', 'et.display_name as event_name', 'j.project_code',
      'r.rule_code', 'r.rule_name', 'm.name as manager_name', 'l.location_name')
    .orderBy([{ column: 'e.occurred_at', order: paging.dir }, { column: 'e.point_event_id', order: paging.dir }])
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

/**
 * A MANUAL ADJUSTMENT, the only way a person moves a balance by hand.
 *
 * There is no editing a balance and no deleting an event: an award made in
 * error is corrected by an adjustment that says so, and both stay on the
 * record. The reason is required for the same reason it is on a wallet.
 */
async function adjust(body, actor) {
  if (!body.party_id || !body.point_type_id) throw new HttpError(400, 'crm.customerAndPointTypeAreRequired');
  if (!body.description || !String(body.description).trim()) throw new HttpError(400, 'crm.aReasonIsRequired');

  const delta = Number(body.points_delta);
  if (!isFinite(delta) || delta === 0) throw new HttpError(400, 'crm.pointsMustNotBeZero');

  const event = await transaction(function (trx) {
    return ledger.post(trx, {
      party_id: body.party_id,
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
  return db('v_crm_point_account_drift as d')
    .join('crm_party as p', 'p.party_id', 'd.party_id')
    .join('crm_point_type as t', 't.point_type_id', 'd.point_type_id')
    .select('d.*', 'p.party_no', 'p.display_name as party_name', 't.point_type_code');
}

module.exports = {
  PAGE: PAGE,
  searchAccounts: searchAccounts,
  searchEvents: searchEvents,
  adjust: adjust,
  drift: drift
};
