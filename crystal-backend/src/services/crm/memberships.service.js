const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/**
 * MEMBERSHIPS AND PROJECT TIERS - design section 3.6 / 9.
 *
 * One membership state per party and project. The PROJECT owns its tiers:
 * an Eshop card level means something only inside the Eshop, and is never
 * averaged with another project's levels - that is what the Dream corporate
 * grade is for. The database holds the line too: a membership can only point
 * at a tier of its own project (composite key on tier + project).
 *
 * A tier change is an append to the tier history AND an update of the current
 * tier, in one transaction. Imports do it when a project reports a new level;
 * this screen does it when a manager corrects one, with the reason recorded.
 */

const PAGE = '/admin/crm/memberships';
const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT'];

function query(filters) {
  const qb = db('crm_membership as m')
    .join('crm_party as p', 'p.party_id', 'm.party_id')
    .join('crm_project as j', 'j.project_id', 'm.project_id')
    .leftJoin('crm_project_tier as t', 't.project_tier_id', 'm.current_tier_id');
  if (filters.project_id) qb.where('m.project_id', filters.project_id);
  if (filters.current_tier_id) qb.where('m.current_tier_id', filters.current_tier_id);
  if (filters.membership_status) qb.where('m.membership_status', filters.membership_status);
  if (filters.party_id) qb.where('m.party_id', filters.party_id);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('p.display_name', 'ilike', like).orWhere('p.party_no', 'ilike', like).orWhere('m.external_member_id', 'ilike', like);
    });
  }
  return qb;
}

async function search(filters, paging) {
  const count = await query(filters).count({ c: '*' }).first();
  const sort = { tier_value: 'm.tier_value', joined_at: 'm.joined_at', available_reward_points: 'm.available_reward_points' }[paging.sort]
    || 'm.membership_id';
  const rows = await query(filters)
    .select('m.*', 'p.party_no', 'p.display_name as party_name', 'j.project_code', 'j.project_name',
      't.tier_code', 't.tier_name', 't.rank_no as tier_rank',
      db.raw('(SELECT COUNT(*) FROM crm_membership_tier_history h WHERE h.membership_id = m.membership_id)::int AS change_cnt'))
    .orderByRaw(sort + ' ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST')
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

/** Members per tier, per project - the shape of each project's own ladder. */
function distribution() {
  return db.raw(`
    SELECT j.project_id, j.project_code, t.project_tier_id, t.tier_code, t.tier_name, t.rank_no,
           COUNT(m.membership_id)::int AS members
      FROM crm_project_tier t
      JOIN crm_project j ON j.project_id = t.project_id
      LEFT JOIN crm_membership m ON m.current_tier_id = t.project_tier_id AND m.membership_status = 'ACTIVE'
     WHERE t.is_active
     GROUP BY j.project_id, t.project_tier_id
     ORDER BY j.project_id, t.rank_no`).then(function (result) { return result.rows; });
}

function history(membershipId) {
  return db('crm_membership_tier_history as h')
    .leftJoin('crm_project_tier as o', 'o.project_tier_id', 'h.old_tier_id')
    .join('crm_project_tier as n', 'n.project_tier_id', 'h.new_tier_id')
    .where('h.membership_id', membershipId).orderBy('h.changed_at', 'desc')
    .select('h.*', 'o.tier_name as old_tier_name', 'n.tier_name as new_tier_name');
}

/** A manager's correction of a tier: history appended, current tier set, together. */
async function setTier(membershipId, body, actor) {
  if (!body.reason || !String(body.reason).trim()) throw new HttpError(400, 'crm.aReasonIsRequired');

  const result = await transaction(async function (trx) {
    const membership = await trx('crm_membership').where('membership_id', membershipId).forUpdate().first();
    if (!membership) throw new HttpError(404, 'common.notFound');
    const tier = await trx('crm_project_tier').where('project_tier_id', body.tier_id).first();
    if (!tier || tier.project_id !== membership.project_id) throw new HttpError(409, 'crm.thatTierBelongsToAnotherProject');
    if (String(membership.current_tier_id) === String(tier.project_tier_id)) throw new HttpError(409, 'crm.alreadyOnThatTier');

    await trx('crm_membership_tier_history').insert({
      membership_id: membership.membership_id, old_tier_id: membership.current_tier_id, new_tier_id: tier.project_tier_id,
      change_reason: String(body.reason).trim().slice(0, 250)
    });
    const [after] = await trx('crm_membership').where('membership_id', membership.membership_id)
      .update({ current_tier_id: tier.project_tier_id }).returning('*');
    return { before: membership, after: after };
  });

  audit.updated(actor, 'crm_membership', membershipId, result.before, result.after, PAGE);
  return result.after;
}

async function setStatus(membershipId, status, actor) {
  if (STATUSES.indexOf(status) === -1) throw new HttpError(400, 'crm.notAStatusYouCanSet');
  const before = await db('crm_membership').where('membership_id', membershipId).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  const patch = { membership_status: status, left_at: status === 'LEFT' ? db.fn.now() : null };
  const [after] = await db('crm_membership').where('membership_id', membershipId).update(patch).returning('*');
  audit.updated(actor, 'crm_membership', membershipId, before, after, PAGE);
  return after;
}

module.exports = { PAGE: PAGE, search: search, distribution: distribution, history: history, setTier: setTier, setStatus: setStatus };
