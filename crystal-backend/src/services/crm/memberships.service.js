const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');
const { searchId } = require('./partyId');

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
  const qb = db('crm_membership as membership')
    .join('crm_party as party', 'party.party_pk', 'membership.party_pk')
    .join('crm_project as project', 'project.project_id', 'membership.project_id')
    .leftJoin('crm_project_tier as tier', 'tier.project_tier_id', 'membership.current_tier_id');
  if (filters.project_id) qb.where('membership.project_id', filters.project_id);
  if (filters.current_tier_id) qb.where('membership.current_tier_id', filters.current_tier_id);
  if (filters.membership_status) qb.where('membership.membership_status', filters.membership_status);
  if (filters.party_pk) qb.where('membership.party_pk', filters.party_pk);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('party.display_name', 'ilike', like).orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)]).orWhere('membership.external_member_id', 'ilike', like);
    });
  }
  return qb;
}

async function search(filters, paging) {
  const count = await query(filters).count({ c: '*' }).first();
  const sort = { tier_value: 'membership.tier_value', joined_at: 'membership.joined_at', available_reward_points: 'membership.available_reward_points' }[paging.sort]
    || 'membership.membership_id';
  const rows = await query(filters)
    .select('membership.*', 'party.party_pk', 'party.display_name as party_name', 'project.project_code', 'project.project_name',
      'tier.tier_code', 'tier.tier_name', 'tier.rank_no as tier_rank',
      db.raw('(SELECT COUNT(*) FROM crm_membership_tier_history tier_history WHERE tier_history.membership_id = membership.membership_id)::int AS change_cnt'))
    .orderByRaw(sort + ' ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST')
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

/** Members per tier, per project - the shape of each project's own ladder. */
function distribution() {
  return db.raw(`
    SELECT project.project_id, project.project_code, tier.project_tier_id, tier.tier_code, tier.tier_name, tier.rank_no,
           COUNT(membership.membership_id)::int AS members
      FROM crm_project_tier tier
      JOIN crm_project project ON project.project_id = tier.project_id
      LEFT JOIN crm_membership membership ON membership.current_tier_id = tier.project_tier_id AND membership.membership_status = 'ACTIVE'
     WHERE tier.is_active
     GROUP BY project.project_id, tier.project_tier_id
     ORDER BY project.project_id, tier.rank_no`).then(function (result) { return result.rows; });
}

function history(membershipId) {
  return db('crm_membership_tier_history as tier_history')
    .leftJoin('crm_project_tier as old_tier', 'old_tier.project_tier_id', 'tier_history.old_tier_id')
    .join('crm_project_tier as new_tier', 'new_tier.project_tier_id', 'tier_history.new_tier_id')
    .where('tier_history.membership_id', membershipId).orderBy('tier_history.changed_at', 'desc')
    .select('tier_history.*', 'old_tier.tier_name as old_tier_name', 'new_tier.tier_name as new_tier_name');
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
