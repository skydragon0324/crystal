const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');
const { searchId } = require('./partyId');

/**
 * MEMBERSHIPS AND PROJECT TIERS - design section 3.6 / 9.
 *
 * A project may rank its customers on several KINDS of ladder at once - a
 * level, a grade, a card class, others added in Settings > Tier kinds - and
 * ranks each of a customer's ACCOUNTS there. So a membership is one account's
 * place on one kind of ladder: one row per (project_account_id, tier_kind).
 * The account row says whose it is, in which project and by which Account ID;
 * the membership repeats none of it. A tier of an unlinked account is gone
 * with the account.
 *
 * The PROJECT owns its tiers: an Eshop card level means something only inside
 * the Eshop, and is never averaged with another project's levels - that is
 * what the Dream corporate grade is for. A membership's tier is of its own
 * kind (composite key on tier + kind) and of its account's project (checked
 * here, wherever a tier is set).
 *
 * A tier change is an append to the tier history AND an update of the current
 * tier, in one transaction. Imports do it when a project reports a new level;
 * a manager does it here, adding a tier or correcting one, with a reason.
 */

const PAGE = '/admin/crm/memberships';
const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT'];

function query(filters) {
  // The account says whose, where and by which Account ID; a tier of an unlinked account is not listed.
  const qb = db('crm_membership as membership')
    .join('crm_project_account as account', 'account.project_account_id', 'membership.project_account_id')
    .join('crm_project as project', 'project.project_id', 'account.project_id')
    .join('crm_party as party', 'party.party_pk', 'account.party_pk')
    .whereNull('account.unlinked_at')
    .leftJoin('crm_tier_kind as kind', 'kind.kind_code', 'membership.tier_kind')
    .leftJoin('crm_project_tier as tier', 'tier.project_tier_id', 'membership.current_tier_id');
  if (filters.project_id) qb.where('account.project_id', filters.project_id);
  if (filters.tier_kind) qb.where('membership.tier_kind', filters.tier_kind);
  if (filters.current_tier_id) qb.where('membership.current_tier_id', filters.current_tier_id);
  if (filters.membership_status) qb.where('membership.membership_status', filters.membership_status);
  if (filters.party_pk) qb.where('account.party_pk', filters.party_pk);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('party.display_name', 'ilike', like).orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)])
        .orWhere('membership.external_member_id', 'ilike', like).orWhere('account.external_account_id', 'ilike', like);
    });
  }
  return qb;
}

async function search(filters, paging) {
  const count = await query(filters).count({ c: '*' }).first();
  const sort = { tier_value: 'membership.tier_value', joined_at: 'membership.joined_at' }[paging.sort] || 'membership.membership_id';
  const rows = await query(filters)
    .select('membership.*', 'party.party_pk', 'party.display_name as party_name', 'account.project_id', 'account.external_account_id',
      'project.project_code', 'project.project_name', 'kind.kind_name', 'tier.tier_code', 'tier.tier_name', 'tier.rank_no as tier_rank',
      db.raw('(SELECT COUNT(*) FROM crm_membership_tier_history tier_history WHERE tier_history.membership_id = membership.membership_id)::int AS change_cnt'))
    .orderByRaw(sort + ' ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST')
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

/** Members per tier, per project and kind - the shape of each of a project's ladders. */
function distribution() {
  return db.raw(`
    SELECT project.project_id, project.project_code, tier.tier_kind, kind.kind_name, kind.sort_no AS kind_sort,
           tier.project_tier_id, tier.tier_code, tier.tier_name, tier.rank_no,
           COUNT(membership.membership_id)::int AS members
      FROM crm_project_tier tier
      JOIN crm_project project ON project.project_id = tier.project_id
      LEFT JOIN crm_tier_kind kind ON kind.kind_code = tier.tier_kind
      LEFT JOIN crm_membership membership ON membership.current_tier_id = tier.project_tier_id AND membership.membership_status = 'ACTIVE'
                AND EXISTS (SELECT 1 FROM crm_project_account account WHERE account.project_account_id = membership.project_account_id AND account.unlinked_at IS NULL)
     WHERE tier.is_active
     GROUP BY project.project_id, tier.project_tier_id, kind.tier_kind_id
     ORDER BY project.project_id, kind.sort_no NULLS LAST, tier.tier_kind, tier.rank_no`).then(function (result) { return result.rows; });
}

function history(membershipId) {
  return db('crm_membership_tier_history as tier_history')
    .leftJoin('crm_project_tier as old_tier', 'old_tier.project_tier_id', 'tier_history.old_tier_id')
    .join('crm_project_tier as new_tier', 'new_tier.project_tier_id', 'tier_history.new_tier_id')
    .where('tier_history.membership_id', membershipId).orderBy('tier_history.changed_at', 'desc')
    .select('tier_history.*', 'old_tier.tier_name as old_tier_name', 'new_tier.tier_name as new_tier_name');
}

/** The tier history appended and the current tier set, together; `membership` is locked by the caller. */
async function moveTo(trx, membership, tier, reason, changedAt) {
  await trx('crm_membership_tier_history').insert(Object.assign({
    membership_id: membership.membership_id, old_tier_id: membership.current_tier_id, new_tier_id: tier.project_tier_id,
    change_reason: reason ? String(reason).trim().slice(0, 250) : null
  }, changedAt ? { changed_at: changedAt } : {}));
  const [after] = await trx('crm_membership').where('membership_id', membership.membership_id)
    .update({ current_tier_id: tier.project_tier_id, updated_at: trx.fn.now() }).returning('*');
  return after;
}

/**
 * An account put on a tier its project reported - a sync, not a manager. With
 * `changedAt` - when the project says the tier changed - the tier history and
 * a new membership's joined date carry that date rather than now. The
 * account gets a place on the tier's kind of ladder, or moves to the tier
 * there, or is already on it. CREATED, CHANGED or UNCHANGED, with the rows.
 * The tier is the account's project's, checked by the caller.
 */
async function placeOn(trx, projectAccountId, tier, reason, changedAt) {
  const membership = await trx('crm_membership')
    .where({ project_account_id: projectAccountId, tier_kind: tier.tier_kind }).forUpdate().first();
  if (membership) {
    if (String(membership.current_tier_id) === String(tier.project_tier_id)) return { status: 'UNCHANGED', after: membership };
    return { status: 'CHANGED', before: membership, after: await moveTo(trx, membership, tier, reason, changedAt) };
  }
  const [row] = await trx('crm_membership').insert({
    project_account_id: projectAccountId, tier_kind: tier.tier_kind, current_tier_id: tier.project_tier_id,
    membership_status: 'ACTIVE', joined_at: changedAt || trx.fn.now()
  }).returning('*');
  await trx('crm_membership_tier_history').insert(Object.assign({
    membership_id: row.membership_id, old_tier_id: null, new_tier_id: tier.project_tier_id, change_reason: reason || null
  }, changedAt ? { changed_at: changedAt } : {}));
  return { status: 'CREATED', after: row };
}

/** A tier value as a system sends it and a tier's Code in the project, compared as numbers when both are ("03" is 3). */
function sameCode(sent, code) {
  const a = String(sent).trim();
  const b = String(code === null || code === undefined ? '' : code).trim();
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) === Number(b);
  return a !== '' && a.toUpperCase() === b.toUpperCase();
}

/** The active tier of a kind whose Code in the project is the value a system sent, or null. */
function tierByCode(tiers, kind, value) {
  return (tiers || []).filter(function (tier) { return tier.tier_kind === kind && tier.is_active !== false && sameCode(value, tier.source_code); })[0] || null;
}

/** A manager's correction of a tier: within the membership's own project and kind. */
async function setTier(membershipId, body, actor) {
  if (!body.reason || !String(body.reason).trim()) throw new HttpError(400, 'crm.common.aReasonIsRequired');

  const result = await transaction(async function (trx) {
    const membership = await trx('crm_membership').where('membership_id', membershipId).forUpdate().first();
    if (!membership) throw new HttpError(404, 'common.notFound');
    const account = await trx('crm_project_account').where('project_account_id', membership.project_account_id).first('project_id');
    const tier = await trx('crm_project_tier').where('project_tier_id', body.tier_id).first();
    if (!tier || !account || tier.project_id !== account.project_id) throw new HttpError(409, 'crm.memberships.thatTierBelongsToAnotherProject');
    if (tier.tier_kind !== membership.tier_kind) throw new HttpError(409, 'crm.memberships.thatTierIsOfAnotherKind');
    if (String(membership.current_tier_id) === String(tier.project_tier_id)) throw new HttpError(409, 'crm.memberships.alreadyOnThatTier');
    return { before: membership, after: await moveTo(trx, membership, tier, body.reason) };
  });

  audit.updated(actor, 'crm_membership', membershipId, result.before, result.after, PAGE);
  return result.after;
}

/**
 * A tier given by hand to one of a customer's accounts: { project_account_id,
 * tier_id, reason?, joined_at?, external_member_id? }. The tier says its kind;
 * if the account has no place on that kind of ladder yet it gets one, and if
 * it has, the tier is changed there (a reason is then required, as for any
 * change). Either way the step is in the tier history.
 */
async function addTier(partyPk, body, actor) {
  const input = body || {};
  if (!/^[1-9][0-9]*$/.test(String(partyPk || ''))) {
    throw new HttpError(400, 'crm.common.checkTheDetails', [{ field: 'party_pk', message: 'crm.common.chooseACustomer' }]);
  }
  if (!/^[1-9][0-9]*$/.test(String(input.project_account_id || ''))) {
    throw new HttpError(400, 'crm.common.checkTheDetails', [{ field: 'project_account_id', message: 'crm.memberships.chooseAnAccount' }]);
  }
  if (!/^[1-9][0-9]*$/.test(String(input.tier_id || ''))) {
    throw new HttpError(400, 'crm.common.checkTheDetails', [{ field: 'tier_id', message: 'crm.memberships.chooseATier' }]);
  }

  const result = await transaction(async function (trx) {
    const account = await trx('crm_project_account').where({ project_account_id: input.project_account_id, party_pk: partyPk })
      .whereNull('unlinked_at').first('project_account_id', 'project_id', 'party_pk', 'external_account_id');
    if (!account) throw new HttpError(404, 'common.notFound');
    const tier = await trx('crm_project_tier').where('project_tier_id', input.tier_id).first();
    if (!tier || tier.project_id !== account.project_id) {
      throw new HttpError(409, 'crm.common.checkTheDetails', [{ field: 'tier_id', message: 'crm.memberships.thatTierBelongsToAnotherProject' }]);
    }

    const membership = await trx('crm_membership')
      .where({ project_account_id: account.project_account_id, tier_kind: tier.tier_kind }).forUpdate().first();
    if (membership) {
      if (String(membership.current_tier_id) === String(tier.project_tier_id)) throw new HttpError(409, 'crm.memberships.alreadyOnThatTier');
      if (!input.reason || !String(input.reason).trim()) {
        throw new HttpError(400, 'crm.common.checkTheDetails', [{ field: 'reason', message: 'crm.memberships.aReasonForTheChange' }]);
      }
      return { created: false, before: membership, after: await moveTo(trx, membership, tier, input.reason) };
    }

    const [row] = await trx('crm_membership').insert({
      project_account_id: account.project_account_id, tier_kind: tier.tier_kind, current_tier_id: tier.project_tier_id, membership_status: 'ACTIVE',
      external_member_id: input.external_member_id ? String(input.external_member_id).trim().slice(0, 250) : null,
      joined_at: input.joined_at || trx.fn.now()
    }).returning('*');
    await trx('crm_membership_tier_history').insert({
      membership_id: row.membership_id, old_tier_id: null, new_tier_id: tier.project_tier_id,
      change_reason: input.reason ? String(input.reason).trim().slice(0, 250) : null
    });
    return { created: true, after: row };
  });

  if (result.created) audit.created(actor, 'crm_membership', result.after.membership_id, result.after, PAGE);
  else audit.updated(actor, 'crm_membership', result.after.membership_id, result.before, result.after, PAGE);
  return result.after;
}

async function setStatus(membershipId, status, actor) {
  if (STATUSES.indexOf(status) === -1) throw new HttpError(400, 'crm.common.notAStatusYouCanSet');
  const before = await db('crm_membership').where('membership_id', membershipId).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  const patch = { membership_status: status, left_at: status === 'LEFT' ? db.fn.now() : null };
  const [after] = await db('crm_membership').where('membership_id', membershipId).update(patch).returning('*');
  audit.updated(actor, 'crm_membership', membershipId, before, after, PAGE);
  return after;
}

module.exports = { PAGE: PAGE, search: search, distribution: distribution, history: history, setTier: setTier, addTier: addTier, placeOn: placeOn, tierByCode: tierByCode, setStatus: setStatus };
