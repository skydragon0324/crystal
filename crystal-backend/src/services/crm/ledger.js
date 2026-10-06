const vocabulary = require('../../repositories/crm/vocabulary.repository');
const { HttpError } = require('../../utils/response');
const { points: roundPoints } = require('../../utils/query');

/**
 * THE ONE WAY A POINT MOVES.
 *
 * crm_point_account.balance is a cached total of crm_point_event, exactly as
 * wallets.point_balance is of point_logs - and a cache is only as good as the
 * discipline of the code that writes beside it. So every movement in the CRM
 * comes through here: a manual adjustment, a registration reward, a
 * reservation paid for in points and its refund, a program award, the Crystal
 * import. There is no second path to get wrong.
 *
 * What it guarantees, inside the caller's transaction:
 *
 *   the account row is LOCKED before its balance is read, so two movements on
 *   the same balance cannot both read it and both decide there was enough;
 *
 *   a movement that would take the balance below zero is REFUSED, unless the
 *   caller is mirroring a ledger that already allowed it (the importer);
 *
 *   balance = lifetime_earned - lifetime_spent after every write, which the
 *   table's CHECK also insists on - so a mistake here fails loudly rather
 *   than drifting;
 *
 *   the event records the balance it left behind, so the ledger can be read
 *   on its own without replaying it.
 *
 * The sign of the movement must agree with its event type - an EARN cannot be
 * negative - and a trigger enforces that too.
 */

/** The account for (party, currency), created empty on first use, and locked. */
async function lockAccount(trx, partyId, pointTypeId) {
  await trx.raw(
    `INSERT INTO crm_point_account (party_pk, point_type_id)
     VALUES (?, ?)
     ON CONFLICT (party_pk, point_type_id) DO NOTHING`,
    [partyId, pointTypeId]
  );

  return trx('crm_point_account')
    .where({ party_pk: partyId, point_type_id: pointTypeId })
    .forUpdate()
    .first();
}

/**
 * Post one movement. Returns the event row.
 *
 *   entry.party_pk, entry.point_type_id, entry.points_delta   required
 *   entry.event_code                                          EARN | REDEEM | ADJUST | ...
 *   entry.project_id                                          defaults to the currency's owner, else PLATFORM
 *   entry.allow_negative                                      the importer only
 *   everything else is copied onto the event if it is one of its columns
 */
async function post(trx, entry) {
  const delta = roundPoints(entry.points_delta);
  if (!delta) throw new HttpError(400, 'crm.pointsMustNotBeZero');

  const eventTypeId = await vocabulary.idOf('crm_point_event_type', entry.event_code, trx);
  if (!eventTypeId) throw new HttpError(400, 'crm.unknownPointEvent', null, { code: entry.event_code });

  const pointType = await trx('crm_point_type').where('point_type_id', entry.point_type_id).first();
  if (!pointType) throw new HttpError(400, 'crm.unknownPointType');
  if (!pointType.is_active && !entry.allow_inactive) throw new HttpError(409, 'crm.pointTypeIsInactive');

  let projectId = entry.project_id || pointType.owner_project_id;
  if (!projectId) projectId = await vocabulary.idOf('crm_project', 'PLATFORM', trx);

  const account = await lockAccount(trx, entry.party_pk, entry.point_type_id);
  const balance = roundPoints(Number(account.balance) + delta);

  if (balance < 0 && !entry.allow_negative) {
    throw new HttpError(409, 'crm.notEnoughPoints', null, {
      balance: roundPoints(account.balance), needed: roundPoints(-delta)
    });
  }

  const [event] = await trx('crm_point_event').insert({
    point_account_id: account.point_account_id,
    point_event_type_id: eventTypeId,
    point_rule_id: entry.point_rule_id || null,
    project_id: projectId,
    points_delta: delta,
    pay_amount: entry.pay_amount === undefined ? null : entry.pay_amount,
    points_balance_after: balance,
    related_transaction_id: entry.related_transaction_id || null,
    related_product_registration_id: entry.related_product_registration_id || null,
    related_reservation_id: entry.related_reservation_id || null,
    related_award_id: entry.related_award_id || null,
    related_service_center_activity_id: entry.related_service_center_activity_id || null,
    performed_by_service_center_id: entry.performed_by_service_center_id || null,
    performed_by_manager_id: entry.performed_by_manager_id || null,
    description: entry.description ? String(entry.description).slice(0, 500) : null,
    device_ref: entry.device_ref || null,
    source_table_code: entry.source_table_code || null,
    external_event_id: entry.external_event_id || null,
    ip_address: entry.ip_address || null,
    occurred_at: entry.occurred_at || trx.fn.now()
  }).returning('*');

  await trx('crm_point_account')
    .where('point_account_id', account.point_account_id)
    .update({
      balance: balance,
      lifetime_earned: roundPoints(Number(account.lifetime_earned) + (delta > 0 ? delta : 0)),
      lifetime_spent: roundPoints(Number(account.lifetime_spent) + (delta < 0 ? -delta : 0)),
      last_event_at: event.occurred_at,
      membership_id: account.membership_id || entry.membership_id || null,
      updated_at: trx.fn.now()
    });

  return event;
}

module.exports = { post: post, lockAccount: lockAccount };
