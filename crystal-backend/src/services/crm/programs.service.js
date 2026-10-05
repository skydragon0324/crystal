const crypto = require('crypto');
const db = require('../../config/db');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const ledger = require('./ledger');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');
const { searchId } = require('./partyId');

/**
 * ACTIVITY PROGRAMS: who may take part, how many times, and what they get.
 *
 * The vendor's new-phone reservations, lotteries, year-end prize services and
 * puzzles were each a table of their own with a comma list of agencies and a
 * normal/reward count. One program here covers all of them:
 *
 *   TARGETS    the people who may take part - built from a segment, a points
 *              ranking, a corporate grade, what they own or what they did at a
 *              site - each with how many entries they are allowed;
 *   QUOTAS     how many entries exist at all, per entry type, tier or site;
 *   RESERVATIONS  the numbered entries themselves, from booking to pickup;
 *   REWARDS and AWARDS  what the program hands out, and to whom.
 *
 * THE LIFECYCLE, and why each step exists:
 *
 *   DRAFT -> APPROVED       a second manager signs it off. The table refuses
 *                           an approval by the manager who created it.
 *   APPROVED -> TARGETS_FROZEN  the list of who may take part stops changing,
 *                           so nobody is added after they could see who won.
 *   TARGETS_FROZEN -> OPEN  entries can be taken.
 *   OPEN -> CLOSED -> FULFILLED
 *   anything unfinished -> CANCELLED, which releases every open entry and
 *                           refunds any points it cost.
 */

const PAGE = '/admin/crm/programs';

const TYPES = ['RESERVATION', 'LOTTERY', 'PRIZE_SERVICE', 'PUZZLE', 'SURVEY_REWARD', 'EVENT_ATTENDANCE'];
const BASES = ['SEGMENT', 'POINT_RANKING', 'CORPORATE_GRADE', 'PRODUCT_REGISTRATION', 'LOCATION_ACTIVITY', 'MANUAL', 'IMPORT', 'OPEN'];

const FLOW = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['DRAFT', 'TARGETS_FROZEN', 'CANCELLED'],
  TARGETS_FROZEN: ['OPEN', 'CANCELLED'],
  OPEN: ['CLOSED', 'CANCELLED'],
  CLOSED: ['FULFILLED'],
  FULFILLED: [],
  CANCELLED: []
};

const SETUP = ['DRAFT', 'APPROVED'];
const LIVE = ['DRAFT', 'APPROVED', 'TARGETS_FROZEN', 'OPEN'];

const COLUMNS = ['program_code', 'program_name', 'program_type', 'project_id', 'description', 'summary',
  'approval_no', 'reserved_product_id', 'eligibility_basis', 'eligibility_segment_id', 'eligibility_rule',
  'ranking_point_type_id', 'ranking_cutoff_at', 'ranking_top_n', 'cost_point_type_id', 'cost_points',
  'number_prefix', 'number_suffix', 'number_start', 'number_end', 'display_at', 'starts_at', 'ends_at',
  'fulfilment_ends_at', 'is_private', 'campaign_id', 'external_system_code', 'is_test'];

/* Fields that may still be changed once the program has been approved. */
const AFTER_APPROVAL = ['description', 'summary', 'display_at', 'fulfilment_ends_at', 'is_private', 'campaign_id'];

function clean(body, columns) {
  const out = {};
  columns.forEach(function (column) {
    if (body[column] === undefined) return;
    let columnValue = body[column] === '' ? null : body[column];
    if (column === 'eligibility_rule' && columnValue && typeof columnValue === 'string') {
      try { columnValue = JSON.parse(columnValue); } catch (error) { throw new HttpError(400, 'crm.theRuleIsNotValidJson'); }
    }
    if (column === 'eligibility_rule' && columnValue) columnValue = JSON.stringify(columnValue);
    out[column] = columnValue;
  });
  return out;
}

async function loadProgram(trx, id, lock) {
  const qb = trx('crm_activity_program').where('activity_program_id', id);
  const row = await (lock ? qb.forUpdate() : qb).first();
  if (!row) throw new HttpError(404, 'common.notFound');
  return row;
}

function requireStatus(program, allowed, key) {
  if (allowed.indexOf(program.status) === -1) {
    throw new HttpError(409, key || 'crm.notWhileTheProgramIs', null, { status: program.status });
  }
}

/* ------------------------------------------------------------ programs */

async function search(filters, paging) {
  const qb = function () {
    const query = db('crm_activity_program as program').leftJoin('crm_project as project', 'project.project_id', 'program.project_id');
    if (filters.status) query.where('program.status', filters.status);
    if (filters.program_type) query.where('program.program_type', filters.program_type);
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('program.program_code', 'ilike', like).orWhere('program.program_name', 'ilike', like); });
    }
    return query;
  };

  const count = await qb().count({ total: '*' }).first();
  const sort = { starts_at: 'program.starts_at', program_code: 'program.program_code', created_at: 'program.created_at' }[paging.sort]
    || 'program.activity_program_id';
  const rows = await qb().select('program.*', 'project.project_code',
    db.raw('(SELECT COUNT(*) FROM crm_activity_target target WHERE target.activity_program_id = program.activity_program_id AND target.status <> \'REVOKED\')::int AS target_cnt'),
    db.raw('(SELECT COUNT(*) FROM crm_activity_reservation reservation WHERE reservation.activity_program_id = program.activity_program_id AND reservation.status NOT IN (\'CANCELLED\', \'EXPIRED\', \'FAILED\'))::int AS reservation_cnt'),
    db.raw('(SELECT COUNT(*) FROM crm_activity_award award WHERE award.activity_program_id = program.activity_program_id AND award.status <> \'CANCELLED\')::int AS award_cnt'))
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(count.total) };
}

async function detail(id) {
  const program = await db('crm_activity_program as program')
    .leftJoin('crm_project as project', 'project.project_id', 'program.project_id')
    .leftJoin('crm_segment as segment', 'segment.segment_id', 'program.eligibility_segment_id')
    .leftJoin('crm_point_type as rt', 'rt.point_type_id', 'program.ranking_point_type_id')
    .leftJoin('crm_point_type as ct', 'ct.point_type_id', 'program.cost_point_type_id')
    .leftJoin('crm_product_catalog as pc', 'pc.product_id', 'program.reserved_product_id')
    .leftJoin('managers as mc', 'mc.id', 'program.created_by_manager_id')
    .leftJoin('managers as ma', 'ma.id', 'program.approved_by_manager_id')
    .where('program.activity_program_id', id)
    .first('program.*', 'project.project_code', 'segment.segment_name', 'rt.point_type_code as ranking_point_type_code',
      'ct.point_type_code as cost_point_type_code', 'pc.product_name as reserved_product_name',
      'mc.name as created_by_name', 'ma.name as approved_by_name');
  if (!program) throw new HttpError(404, 'common.notFound');

  const [tiers, locations, quotas, rewards, counts] = await Promise.all([
    db('crm_activity_program_tier').where('activity_program_id', id).orderBy('rank_no'),
    db('crm_activity_program_service_center as program_center')
      .join('crm_service_center as center', 'center.service_center_id', 'program_center.service_center_id')
      .where('program_center.activity_program_id', id).orderBy('center.service_center_name')
      .select('program_center.*', 'center.service_center_code', 'center.service_center_name'),
    db('crm_activity_program_quota as quota')
      .leftJoin('crm_activity_program_tier as tier', 'tier.program_tier_id', 'quota.program_tier_id')
      .leftJoin('crm_service_center as center', 'center.service_center_id', 'quota.service_center_id')
      .where('quota.activity_program_id', id).orderBy('quota.program_quota_id')
      .select('quota.*', 'tier.tier_name', 'center.service_center_name'),
    db('crm_activity_reward as reward')
      .leftJoin('crm_activity_program_tier as tier', 'tier.program_tier_id', 'reward.program_tier_id')
      .leftJoin('crm_point_type as pt', 'pt.point_type_id', 'reward.point_type_id')
      .leftJoin('crm_product_catalog as pc', 'pc.product_id', 'reward.product_id')
      .where('reward.activity_program_id', id).orderBy('reward.sort_order')
      .select('reward.*', 'tier.tier_name', 'pt.point_type_code', 'pc.product_name'),
    db.raw(`SELECT
        (SELECT COUNT(*) FROM crm_activity_target WHERE activity_program_id = ? AND status <> 'REVOKED')::int AS targets,
        (SELECT COALESCE(SUM(allowed_count), 0) FROM crm_activity_target WHERE activity_program_id = ? AND status <> 'REVOKED')::int AS entries_allowed,
        (SELECT COUNT(*) FROM crm_activity_reservation WHERE activity_program_id = ? AND status IN ('RESERVED', 'PAID'))::int AS reservations_open,
        (SELECT COUNT(*) FROM crm_activity_reservation WHERE activity_program_id = ? AND status = 'FULFILLED')::int AS reservations_fulfilled,
        (SELECT COUNT(*) FROM crm_activity_reservation WHERE activity_program_id = ? AND status IN ('CANCELLED', 'EXPIRED', 'FAILED'))::int AS reservations_released,
        (SELECT COUNT(*) FROM crm_activity_award WHERE activity_program_id = ? AND status NOT IN ('CANCELLED', 'FAILED'))::int AS awards`,
    [id, id, id, id, id, id]).then(function (result) { return result.rows[0]; })
  ]);

  return { program: program, tiers: tiers, locations: locations, quotas: quotas, rewards: rewards, counts: counts };
}

async function create(body, actor) {
  const data = clean(body, COLUMNS);
  if (!data.program_code || !data.program_name) throw new HttpError(400, 'crm.codeAndNameAreRequired');
  if (TYPES.indexOf(data.program_type) === -1) throw new HttpError(400, 'crm.chooseAProgramType');
  if (BASES.indexOf(data.eligibility_basis || '') === -1) throw new HttpError(400, 'crm.chooseWhoMayTakePart');

  const [row] = await db('crm_activity_program').insert(Object.assign(data, {
    status: 'DRAFT',
    created_by_manager_id: actor.manager_id
  })).returning('*');

  audit.created(actor, 'crm_activity_program', row.activity_program_id, row, PAGE);
  return row;
}

async function update(id, body, actor) {
  const before = await loadProgram(db, id);
  requireStatus(before, LIVE.concat(['CLOSED']));

  const data = clean(body, before.status === 'DRAFT' ? COLUMNS : AFTER_APPROVAL);
  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const [after] = await db('crm_activity_program').where('activity_program_id', id).update(data).returning('*');
  audit.updated(actor, 'crm_activity_program', id, before, after, PAGE);
  return after;
}

async function transition(id, status, actor) {
  const result = await transaction(async function (trx) {
    const program = await loadProgram(trx, id, true);
    const allowed = FLOW[program.status] || [];
    if (allowed.indexOf(status) === -1) {
      throw new HttpError(409, 'crm.cannotMoveFromTo', null, { from: program.status, to: status });
    }

    const patch = { status: status };

    if (status === 'APPROVED') {
      if (String(program.created_by_manager_id) === String(actor.manager_id)) {
        throw new HttpError(409, 'crm.anotherManagerMustApprove');
      }
      patch.approved_by_manager_id = actor.manager_id;
      patch.approved_at = trx.fn.now();
    }

    if (status === 'DRAFT') {
      patch.approved_by_manager_id = null;
      patch.approved_at = null;
    }

    if (status === 'TARGETS_FROZEN' && program.eligibility_basis !== 'OPEN') {
      const targets = await trx('crm_activity_target')
        .where('activity_program_id', id).whereNot('status', 'REVOKED').count({ total: '*' }).first();
      if (!Number(targets.total)) throw new HttpError(409, 'crm.addTargetsBeforeFreezing');
    }

    if (status === 'FULFILLED') {
      const open = await trx('crm_activity_reservation')
        .where('activity_program_id', id).whereIn('status', ['PENDING', 'RESERVED', 'PAID']).count({ total: '*' }).first();
      if (Number(open.total)) throw new HttpError(409, 'crm.reservationsAreStillOpen', null, { n: Number(open.total) });
    }

    if (status === 'CANCELLED') {
      const open = await trx('crm_activity_reservation')
        .where('activity_program_id', id).whereIn('status', ['PENDING', 'RESERVED', 'PAID']).select('reservation_id');
      for (let index = 0; index < open.length; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await moveReservation(trx, open[index].reservation_id, 'CANCELLED', { note: 'Program cancelled' }, actor);
      }
    }

    const [after] = await trx('crm_activity_program').where('activity_program_id', id).update(patch).returning('*');
    return { before: program, after: after };
  });

  audit.updated(actor, 'crm_activity_program', id, result.before, result.after, PAGE);
  return result.after;
}

/* ------------------------------------------------------------ setup: tiers, sites, quotas, rewards */

async function saveTier(programId, tierId, body, actor) {
  const program = await loadProgram(db, programId);
  requireStatus(program, SETUP, 'crm.tiersAreFixedOnceTargetsAreFrozen');

  const data = {};
  ['tier_code', 'tier_name', 'rank_no', 'min_value', 'max_value', 'entries_per_target',
    'number_range_start', 'number_range_end'].forEach(function (column) {
    if (body[column] !== undefined) data[column] = body[column] === '' ? null : body[column];
  });

  let row;
  if (tierId) {
    [row] = await db('crm_activity_program_tier').where({ program_tier_id: tierId, activity_program_id: programId })
      .update(data).returning('*');
    if (!row) throw new HttpError(404, 'common.notFound');
  } else {
    [row] = await db('crm_activity_program_tier').insert(Object.assign({ activity_program_id: programId }, data)).returning('*');
  }
  audit.updated(actor, 'crm_activity_program_tier', row.program_tier_id, null, row, PAGE);
  return row;
}

async function removeTier(programId, tierId, actor) {
  const program = await loadProgram(db, programId);
  requireStatus(program, SETUP, 'crm.tiersAreFixedOnceTargetsAreFrozen');
  const removed = await db('crm_activity_program_tier').where({ program_tier_id: tierId, activity_program_id: programId }).del();
  if (!removed) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, 'crm_activity_program_tier', tierId, null, PAGE);
}

async function addLocation(programId, body, actor) {
  const program = await loadProgram(db, programId);
  requireStatus(program, LIVE);
  const [row] = await db('crm_activity_program_service_center').insert({
    activity_program_id: programId,
    service_center_id: body.service_center_id,
    service_center_role: body.service_center_role || 'PICKUP'
  }).returning('*');
  audit.created(actor, 'crm_activity_program_service_center', row.program_service_center_id, row, PAGE);
  return row;
}

async function removeLocation(programId, locationRowId, actor) {
  const program = await loadProgram(db, programId);
  requireStatus(program, LIVE);
  const removed = await db('crm_activity_program_service_center').where({ program_service_center_id: locationRowId, activity_program_id: programId }).del();
  if (!removed) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, 'crm_activity_program_service_center', locationRowId, null, PAGE);
}

async function saveQuota(programId, quotaId, body, actor) {
  const program = await loadProgram(db, programId);
  requireStatus(program, LIVE);

  const data = {};
  ['entry_type', 'program_tier_id', 'service_center_id', 'quota_count'].forEach(function (column) {
    if (body[column] !== undefined) data[column] = body[column] === '' ? null : body[column];
  });

  let row;
  if (quotaId) {
    [row] = await db('crm_activity_program_quota').where({ program_quota_id: quotaId, activity_program_id: programId })
      .update(data).returning('*');
    if (!row) throw new HttpError(404, 'common.notFound');
  } else {
    [row] = await db('crm_activity_program_quota').insert(Object.assign({ activity_program_id: programId }, data)).returning('*');
  }
  audit.updated(actor, 'crm_activity_program_quota', row.program_quota_id, null, row, PAGE);
  return row;
}

async function removeQuota(programId, quotaId, actor) {
  const quota = await db('crm_activity_program_quota').where({ program_quota_id: quotaId, activity_program_id: programId }).first();
  if (!quota) throw new HttpError(404, 'common.notFound');
  if (quota.used_count > 0) throw new HttpError(409, 'crm.thisQuotaIsInUse');
  await db('crm_activity_program_quota').where('program_quota_id', quotaId).del();
  audit.deleted(actor, 'crm_activity_program_quota', quotaId, quota, PAGE);
}

async function saveReward(programId, rewardId, body, actor) {
  const program = await loadProgram(db, programId);
  requireStatus(program, LIVE.concat(['CLOSED']));

  const data = {};
  ['program_tier_id', 'reward_name', 'reward_type', 'product_id', 'point_type_id', 'points', 'unit_value',
    'currency_code', 'quantity_total', 'sort_order', 'note'].forEach(function (column) {
    if (body[column] !== undefined) data[column] = body[column] === '' ? null : body[column];
  });

  let row;
  if (rewardId) {
    [row] = await db('crm_activity_reward').where({ reward_id: rewardId, activity_program_id: programId })
      .update(data).returning('*');
    if (!row) throw new HttpError(404, 'common.notFound');
  } else {
    [row] = await db('crm_activity_reward').insert(Object.assign({ activity_program_id: programId }, data)).returning('*');
  }
  audit.updated(actor, 'crm_activity_reward', row.reward_id, null, row, PAGE);
  return row;
}

async function removeReward(programId, rewardId, actor) {
  const reward = await db('crm_activity_reward').where({ reward_id: rewardId, activity_program_id: programId }).first();
  if (!reward) throw new HttpError(404, 'common.notFound');
  if (reward.quantity_awarded > 0) throw new HttpError(409, 'crm.thisRewardHasBeenAwarded');
  await db('crm_activity_reward').where('reward_id', rewardId).del();
  audit.deleted(actor, 'crm_activity_reward', rewardId, reward, PAGE);
}

/* ------------------------------------------------------------ targets */

async function searchTargets(programId, filters, paging) {
  const qb = function () {
    const query = db('crm_activity_target as target')
      .join('crm_party as party', 'party.party_pk', 'target.party_pk')
      .leftJoin('crm_activity_program_tier as tier', 'tier.program_tier_id', 'target.program_tier_id')
      .where('target.activity_program_id', programId);
    if (filters.status) query.where('target.status', filters.status);
    if (filters.entry_type) query.where('target.entry_type', filters.entry_type);
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('party.display_name', 'ilike', like).orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)]); });
    }
    return query;
  };
  const count = await qb().count({ total: '*' }).first();
  const rows = await qb()
    .select('target.*', 'party.party_pk', 'party.display_name as party_name', 'tier.tier_code', 'tier.tier_name')
    .orderByRaw('target.qualification_rank NULLS LAST, target.activity_target_id')
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

/** The tier a qualifying value falls into: the highest-ranked band that contains it. */
function tierFor(tiers, value) {
  if (!tiers.length) return null;
  if (value === null || value === undefined) return tiers[0];
  const numeric = Number(value);
  const fits = tiers.filter(function (tier) {
    return numeric >= Number(tier.min_value) && (tier.max_value === null || numeric < Number(tier.max_value));
  });
  return fits.sort(function (first, second) { return second.rank_no - first.rank_no; })[0] || null;
}

async function addTarget(programId, body, actor) {
  const program = await loadProgram(db, programId);
  requireStatus(program, SETUP, 'crm.targetsAreFrozen');
  if (!body.party_pk) throw new HttpError(400, 'crm.chooseACustomer');

  const tiers = await db('crm_activity_program_tier').where('activity_program_id', programId).orderBy('rank_no');
  const tier = body.program_tier_id
    ? tiers.filter(function (candidateTier) { return String(candidateTier.program_tier_id) === String(body.program_tier_id); })[0]
    : tierFor(tiers, body.qualification_value);

  const [row] = await db('crm_activity_target').insert({
    activity_program_id: programId,
    party_pk: body.party_pk,
    program_tier_id: tier ? tier.program_tier_id : null,
    entry_type: body.entry_type || 'NORMAL',
    allowed_count: body.allowed_count || (tier ? tier.entries_per_target : 1),
    qualification_value: body.qualification_value === '' ? null : (body.qualification_value || null),
    qualification_reason: JSON.stringify({ note: body.note || null, by: actor.manager_login }),
    source: 'MANUAL',
    added_by_manager_id: actor.manager_id
  }).returning('*');

  audit.created(actor, 'crm_activity_target', row.activity_target_id, row, PAGE);
  return row;
}

async function revokeTarget(programId, targetId, actor) {
  const before = await db('crm_activity_target').where({ activity_target_id: targetId, activity_program_id: programId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.status === 'REVOKED') throw new HttpError(409, 'crm.alreadyRevoked');
  const [after] = await db('crm_activity_target').where('activity_target_id', targetId).update({ status: 'REVOKED' }).returning('*');
  audit.updated(actor, 'crm_activity_target', targetId, before, after, PAGE);
  return after;
}

/**
 * BUILD THE TARGET LIST from the program's eligibility basis.
 *
 * Adds whoever qualifies and is not on the list yet; never removes anyone -
 * a manager who added somebody by hand did it on purpose. Each target records
 * what it qualified on (the value, the rank, where it came from), which is
 * what answers "why was I not chosen" afterwards.
 */
async function buildTargets(programId, actor) {
  const program = await loadProgram(db, programId);
  requireStatus(program, SETUP, 'crm.targetsAreFrozen');

  const rule = typeof program.eligibility_rule === 'string'
    ? JSON.parse(program.eligibility_rule || '{}') : (program.eligibility_rule || {});
  const tiers = await db('crm_activity_program_tier').where('activity_program_id', programId).orderBy('rank_no');

  let candidates = [];
  let source;

  switch (program.eligibility_basis) {
    case 'SEGMENT':
      source = 'SEGMENT';
      candidates = (await db('crm_segment_membership as membership').join('crm_party as party', 'party.party_pk', 'membership.party_pk')
        .where('membership.segment_id', program.eligibility_segment_id).whereNull('membership.unmatched_at')
        .where('party.party_status', 'ACTIVE')
        .select('membership.party_pk', 'membership.segment_membership_id'))
        .map(function (row) { return { party_pk: row.party_pk, source_segment_membership_id: row.segment_membership_id }; });
      break;

    case 'POINT_RANKING': {
      source = 'RANKING';
      const ranked = await db.raw(`
        SELECT account.party_pk, SUM(point_event.points_delta) AS value,
               RANK() OVER (ORDER BY SUM(point_event.points_delta) DESC) AS rank
          FROM crm_point_event point_event
          JOIN crm_point_account account ON account.point_account_id = point_event.point_account_id
          JOIN crm_party party ON party.party_pk = account.party_pk
         WHERE account.point_type_id = ? AND point_event.occurred_at <= ? AND party.party_status = 'ACTIVE'
         GROUP BY account.party_pk
        HAVING SUM(point_event.points_delta) > 0
         ORDER BY value DESC
         ${program.ranking_top_n ? 'LIMIT ' + Number(program.ranking_top_n) : ''}`,
      [program.ranking_point_type_id, program.ranking_cutoff_at]);
      candidates = ranked.rows.map(function (row) {
        return { party_pk: row.party_pk, qualification_value: row.value, qualification_rank: Number(row.rank) };
      });
      break;
    }

    case 'CORPORATE_GRADE': {
      source = 'GRADE';
      const minRank = Number(rule.min_grade_rank || 1);
      const graded = await db.raw(`
        SELECT DISTINCT ON (snapshot.party_pk) snapshot.party_pk, grade.rank_no, snapshot.corporate_score
          FROM crm_party_analysis_snapshot snapshot
          JOIN crm_corporate_grade grade ON grade.corporate_grade_id = snapshot.corporate_grade_id
          JOIN crm_party party ON party.party_pk = snapshot.party_pk
         WHERE snapshot.project_id IS NULL AND party.party_status = 'ACTIVE'
         ORDER BY snapshot.party_pk, snapshot.reference_date DESC`);
      candidates = graded.rows.filter(function (row) { return Number(row.rank_no) >= minRank; })
        .map(function (row) { return { party_pk: row.party_pk, qualification_value: row.corporate_score }; });
      break;
    }

    case 'PRODUCT_REGISTRATION': {
      source = 'REGISTRATION';
      const classId = rule.product_class_code
        ? await vocabulary.idOf('crm_product_class', rule.product_class_code) : rule.product_class_id;
      if (!classId) throw new HttpError(409, 'crm.theRuleNeedsAProductClass');
      const owners = await db('crm_party_product_class_stat as class_stat').join('crm_party as party', 'party.party_pk', 'class_stat.party_pk')
        .where('class_stat.product_class_id', classId).where('class_stat.active_owned_count', '>=', Number(rule.min_count || 1))
        .where('party.party_status', 'ACTIVE')
        .select('class_stat.party_pk', 'class_stat.active_owned_count');
      candidates = owners.map(function (row) { return { party_pk: row.party_pk, qualification_value: row.active_owned_count }; });
      break;
    }

    case 'LOCATION_ACTIVITY': {
      source = 'LOCATION';
      const typeId = rule.activity_code ? await vocabulary.idOf('crm_service_center_activity_type', rule.activity_code) : null;
      if (!typeId) throw new HttpError(409, 'crm.theRuleNeedsAnActivity');
      const since = Number(rule.since_days || 365);
      const visits = await db.raw(`
        SELECT activity.party_pk, COUNT(*) AS value
          FROM crm_service_center_activity activity
          JOIN crm_party party ON party.party_pk = activity.party_pk
         WHERE activity.activity_type_id = ? AND activity.status = 'COMPLETED'
           AND activity.occurred_at >= now() - (? || ' days')::interval
           AND party.party_status = 'ACTIVE'
           AND (NOT EXISTS (SELECT 1 FROM crm_activity_program_service_center program_center WHERE program_center.activity_program_id = ?)
                OR activity.service_center_id IN (SELECT service_center_id FROM crm_activity_program_service_center WHERE activity_program_id = ?))
         GROUP BY activity.party_pk
        HAVING COUNT(*) >= ?`, [typeId, String(since), programId, programId, Number(rule.min_count || 1)]);
      candidates = visits.rows.map(function (row) { return { party_pk: row.party_pk, qualification_value: row.value }; });
      break;
    }

    default:
      throw new HttpError(409, 'crm.thisBasisHasNothingToBuild');
  }

  let added = 0;
  await transaction(async function (trx) {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const tier = tierFor(tiers, candidate.qualification_value);
      if (tiers.length && !tier) continue;

      // eslint-disable-next-line no-await-in-loop
      const res = await trx.raw(`
        INSERT INTO crm_activity_target
          (activity_program_id, party_pk, program_tier_id, entry_type, allowed_count,
           qualification_value, qualification_rank, qualification_reason, source,
           source_segment_membership_id, added_by_manager_id)
        VALUES (?, ?, ?, 'NORMAL', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (activity_program_id, party_pk, entry_type) DO NOTHING`,
      [programId, candidate.party_pk, tier ? tier.program_tier_id : null, tier ? tier.entries_per_target : 1,
        candidate.qualification_value === undefined ? null : candidate.qualification_value,
        candidate.qualification_rank || null,
        JSON.stringify({ basis: program.eligibility_basis, rule: rule }),
        source, candidate.source_segment_membership_id || null, actor.manager_id]);
      added += res.rowCount;
    }
  });

  audit.imported(actor, 'crm_activity_target', { program: program.program_code, qualified: candidates.length, added: added }, PAGE);
  return { qualified: candidates.length, added: added };
}

/* ------------------------------------------------------------ reservations */

function reservationQuery() {
  return db('crm_activity_reservation as reservation')
    .join('crm_party as party', 'party.party_pk', 'reservation.party_pk')
    .join('crm_activity_program as program', 'program.activity_program_id', 'reservation.activity_program_id')
    .leftJoin('crm_activity_program_tier as tier', 'tier.program_tier_id', 'reservation.program_tier_id')
    .leftJoin('crm_service_center as center', 'center.service_center_id', 'reservation.service_center_id')
    .leftJoin('crm_product_instance as instance', 'instance.product_instance_id', 'reservation.product_instance_id');
}

async function searchReservations(programId, filters, paging) {
  const qb = function () {
    const query = reservationQuery().where('reservation.activity_program_id', programId);
    if (filters.status) query.where('reservation.status', filters.status);
    if (filters.service_center_id) query.where('reservation.service_center_id', filters.service_center_id);
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () {
        this.where('reservation.reservation_code', 'ilike', like).orWhere('party.display_name', 'ilike', like)
          .orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)]).orWhere('reservation.holder_name', 'ilike', like);
      });
    }
    return query;
  };
  const count = await qb().count({ total: '*' }).first();
  const rows = await qb()
    .select('reservation.*', 'party.party_pk', 'party.display_name as party_name', 'tier.tier_name', 'center.service_center_name',
      'instance.external_product_instance_id')
    .orderBy('reservation.reservation_no', paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

function hashIdCard(value) {
  const text = String(value || '').replace(/\s+/g, '').toUpperCase();
  return text ? crypto.createHash('sha256').update(text).digest('hex') : null;
}

function maskIdCard(value) {
  const text = String(value || '').replace(/\s+/g, '');
  if (text.length <= 4) return text;
  return text.slice(0, 2) + '*'.repeat(text.length - 4) + text.slice(-2);
}

/** The quotas one entry counts against: its type, and its tier and site where a quota names them. */
function matchingQuotas(trx, reservation) {
  return trx('crm_activity_program_quota')
    .where('activity_program_id', reservation.activity_program_id)
    .where('entry_type', reservation.entry_type)
    .where(function () {
      this.whereNull('program_tier_id');
      if (reservation.program_tier_id) this.orWhere('program_tier_id', reservation.program_tier_id);
    })
    .where(function () {
      this.whereNull('service_center_id');
      if (reservation.service_center_id) this.orWhere('service_center_id', reservation.service_center_id);
    })
    .orderBy('program_quota_id')
    .forUpdate();
}

/**
 * TAKE AN ENTRY - the four checks, all under row locks, then the number.
 *
 *   1. the target still has entries left     (their row is locked)
 *   2. every quota it counts against has room (those rows are locked)
 *   3. the ID card has not already been used in this program
 *   4. the points it costs are there          (the account is locked by the ledger)
 *
 * The program row is locked first, which is what makes the numbering safe:
 * two entries taken at the same moment cannot both read the same "last
 * number". Everything happens or nothing does.
 */
async function reserve(programId, body, actor) {
  const result = await transaction(async function (trx) {
    const program = await loadProgram(trx, programId, true);
    requireStatus(program, ['OPEN'], 'crm.theProgramIsNotOpen');

    const now = new Date();
    if (program.starts_at && now < new Date(program.starts_at)) throw new HttpError(409, 'crm.theProgramHasNotStarted');
    if (program.ends_at && now > new Date(program.ends_at)) throw new HttpError(409, 'crm.theProgramHasEnded');

    const entryType = body.entry_type || 'NORMAL';
    const party = await trx('crm_party').where('party_pk', body.party_pk).first();
    if (!party || party.party_status !== 'ACTIVE') throw new HttpError(409, 'crm.chooseAnActiveCustomer');

    /* 1. the target */
    let target = null;
    if (program.eligibility_basis !== 'OPEN') {
      target = await trx('crm_activity_target')
        .where({ activity_program_id: programId, party_pk: party.party_pk, entry_type: entryType })
        .forUpdate().first();
      if (!target || target.status === 'REVOKED') throw new HttpError(409, 'crm.thisCustomerIsNotATarget');
      if (target.used_count >= target.allowed_count) throw new HttpError(409, 'crm.noEntriesLeft');
    }

    /* The site, which has to be one the program runs at, if it names any. */
    const siteId = body.service_center_id || null;
    const sites = await trx('crm_activity_program_service_center').where('activity_program_id', programId);
    if (siteId && sites.length && !sites.some(function (programSite) { return String(programSite.service_center_id) === String(siteId); })) {
      throw new HttpError(409, 'crm.thatSiteIsNotInThisProgram');
    }

    const tierId = target ? target.program_tier_id : null;
    const tier = tierId ? await trx('crm_activity_program_tier').where('program_tier_id', tierId).first() : null;

    /* 2. the quotas */
    const quotas = await matchingQuotas(trx, {
      activity_program_id: programId, entry_type: entryType, program_tier_id: tierId, service_center_id: siteId
    });
    const full = quotas.filter(function (quota) { return quota.used_count >= quota.quota_count; })[0];
    if (full) throw new HttpError(409, 'crm.theQuotaIsFull');

    /* 3. the ID card */
    const cardHash = hashIdCard(body.holder_id_card);
    if (cardHash) {
      const used = await trx('crm_activity_reservation')
        .where({ activity_program_id: programId, holder_id_card_hash: cardHash })
        .whereNotIn('status', ['CANCELLED', 'EXPIRED', 'FAILED']).first('reservation_id');
      if (used) throw new HttpError(409, 'crm.thisIdCardHasAnEntry');
    }

    /* The number: the next one in the tier's range, or the program's. */
    const start = tier && tier.number_range_start !== null ? tier.number_range_start
      : (program.number_start !== null ? program.number_start : 1);
    const end = tier && tier.number_range_end !== null ? tier.number_range_end : program.number_end;

    const last = await trx('crm_activity_reservation')
      .where('activity_program_id', programId)
      .where('reservation_no', '>=', start)
      .modify(function (qb) { if (end !== null && end !== undefined) qb.where('reservation_no', '<=', end); })
      .max({ last_no: 'reservation_no' }).first();
    const number = last && last.last_no !== null ? Number(last.last_no) + 1 : Number(start);
    if (end !== null && end !== undefined && number > Number(end)) throw new HttpError(409, 'crm.noNumbersLeft');

    /* reservation_code is 30 characters, so a long program code is shortened for the default prefix. */
    const width = String(end || Math.max(number, 9999)).length;
    const prefix = program.number_prefix || (String(program.program_code).slice(0, 14) + '-');
    const code = prefix + String(number).padStart(width, '0') + (program.number_suffix || '');

    const [reservation] = await trx('crm_activity_reservation').insert({
      activity_program_id: programId,
      activity_target_id: target ? target.activity_target_id : null,
      party_pk: party.party_pk,
      program_tier_id: tierId,
      entry_type: entryType,
      reservation_no: number,
      reservation_code: code,
      holder_name: body.holder_name || party.display_name,
      holder_id_card_hash: cardHash,
      holder_id_card_masked: body.holder_id_card ? maskIdCard(body.holder_id_card) : null,
      holder_phone: body.holder_phone || null,
      service_center_id: siteId,
      status: 'RESERVED',
      reserved_at: trx.fn.now()
    }).returning('*');

    /* 4. the points */
    if (program.cost_point_type_id && Number(program.cost_points) > 0) {
      await ledger.post(trx, {
        party_pk: party.party_pk,
        point_type_id: program.cost_point_type_id,
        event_code: 'RESERVATION_COST',
        points_delta: -Number(program.cost_points),
        project_id: program.project_id,
        related_reservation_id: reservation.reservation_id,
        performed_by_manager_id: actor.manager_id,
        performed_by_service_center_id: siteId,
        description: program.program_name
      });
    }

    if (target) {
      const used = target.used_count + 1;
      await trx('crm_activity_target').where('activity_target_id', target.activity_target_id).update({
        used_count: used,
        status: used >= target.allowed_count ? 'EXHAUSTED' : target.status
      });
    }
    for (let index = 0; index < quotas.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_activity_program_quota').where('program_quota_id', quotas[index].program_quota_id)
        .update({ used_count: quotas[index].used_count + 1 });
    }

    await trx('crm_activity_reservation_event').insert({
      reservation_id: reservation.reservation_id,
      old_status: null,
      new_status: 'RESERVED',
      actor_type: 'MANAGER',
      actor_manager_id: actor.manager_id,
      actor_service_center_id: siteId,
      note: body.note || null
    });

    return reservation;
  });

  audit.created(actor, 'crm_activity_reservation', result.reservation_id, result, PAGE);
  return result;
}

const RESERVATION_FLOW = {
  PENDING: ['RESERVED', 'CANCELLED', 'FAILED', 'EXPIRED'],
  RESERVED: ['PAID', 'FULFILLED', 'CANCELLED', 'EXPIRED'],
  PAID: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [],
  CANCELLED: [],
  EXPIRED: [],
  FAILED: []
};

/**
 * Move one entry along, inside the caller's transaction.
 *
 * Letting go of an entry - cancelled, expired, failed - gives it back: the
 * target can use it again and the quotas it counted against have room again.
 * Points are REFUNDED on a cancellation or a failure, and NOT on an expiry: an
 * entry that was held and never collected cost somebody else their chance.
 */
async function moveReservation(trx, reservationId, status, body, actor) {
  const reservation = await trx('crm_activity_reservation').where('reservation_id', reservationId).forUpdate().first();
  if (!reservation) throw new HttpError(404, 'common.notFound');

  const allowed = RESERVATION_FLOW[reservation.status] || [];
  if (allowed.indexOf(status) === -1) {
    throw new HttpError(409, 'crm.cannotMoveFromTo', null, { from: reservation.status, to: status });
  }

  const patch = { status: status };
  const siteId = body.service_center_id || reservation.service_center_id;

  if (status === 'PAID') {
    patch.paid_at = trx.fn.now();
    if (body.related_transaction_id) patch.related_transaction_id = body.related_transaction_id;
  }

  if (status === 'FULFILLED') {
    patch.fulfilled_at = trx.fn.now();
    if (body.product_instance_id) patch.product_instance_id = body.product_instance_id;
    if (siteId) patch.service_center_id = siteId;

    if (siteId) {
      const typeId = await vocabulary.idOf('crm_service_center_activity_type', 'RESERVATION_PICKUP', trx);
      const program = await trx('crm_activity_program').where('activity_program_id', reservation.activity_program_id).first();
      if (typeId) {
        await trx('crm_service_center_activity').insert({
          service_center_id: siteId,
          activity_type_id: typeId,
          project_id: program.project_id,
          occurred_at: trx.fn.now(),
          party_pk: reservation.party_pk,
          performed_by_manager_id: actor ? actor.manager_id : null,
          related_reservation_id: reservation.reservation_id,
          related_product_instance_id: body.product_instance_id || reservation.product_instance_id || null,
          external_activity_id: 'reservation:' + reservation.reservation_id
        });
      }
    }
  }

  if (['CANCELLED', 'EXPIRED', 'FAILED'].indexOf(status) !== -1) {
    if (status === 'CANCELLED') {
      patch.cancelled_at = trx.fn.now();
      patch.cancel_reason = body.note ? String(body.note).slice(0, 255) : null;
    }

    if (reservation.activity_target_id) {
      const target = await trx('crm_activity_target').where('activity_target_id', reservation.activity_target_id).forUpdate().first();
      await trx('crm_activity_target').where('activity_target_id', target.activity_target_id).update({
        used_count: Math.max(0, target.used_count - 1),
        status: target.status === 'EXHAUSTED' ? 'ELIGIBLE' : target.status
      });
    }

    const quotas = await matchingQuotas(trx, reservation);
    for (let index = 0; index < quotas.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_activity_program_quota').where('program_quota_id', quotas[index].program_quota_id)
        .update({ used_count: Math.max(0, quotas[index].used_count - 1) });
    }

    if (status !== 'EXPIRED') {
      const cost = await trx('crm_point_event as point_event')
        .join('crm_point_event_type as event_type', 'event_type.point_event_type_id', 'point_event.point_event_type_id')
        .join('crm_point_account as account', 'account.point_account_id', 'point_event.point_account_id')
        .where('point_event.related_reservation_id', reservationId).where('event_type.event_code', 'RESERVATION_COST')
        .first('point_event.points_delta', 'point_event.project_id', 'account.point_type_id', 'account.party_pk');
      const refunded = await trx('crm_point_event as point_event')
        .join('crm_point_event_type as event_type', 'event_type.point_event_type_id', 'point_event.point_event_type_id')
        .where('point_event.related_reservation_id', reservationId).where('event_type.event_code', 'REFUND').first('point_event.point_event_id');

      if (cost && !refunded) {
        await ledger.post(trx, {
          party_pk: cost.party_pk,
          point_type_id: cost.point_type_id,
          event_code: 'REFUND',
          points_delta: -Number(cost.points_delta),
          project_id: cost.project_id,
          related_reservation_id: reservationId,
          performed_by_manager_id: actor ? actor.manager_id : null,
          description: reservation.reservation_code,
          allow_inactive: true
        });
      }
    }
  }

  const [after] = await trx('crm_activity_reservation').where('reservation_id', reservationId).update(patch).returning('*');

  await trx('crm_activity_reservation_event').insert({
    reservation_id: reservationId,
    old_status: reservation.status,
    new_status: status,
    actor_type: actor && actor.manager_id ? 'MANAGER' : 'SYSTEM',
    actor_manager_id: actor ? actor.manager_id : null,
    actor_service_center_id: siteId || null,
    note: body.note ? String(body.note).slice(0, 500) : null
  });

  return { before: reservation, after: after };
}

async function transitionReservation(reservationId, status, body, actor) {
  const result = await transaction(function (trx) {
    return moveReservation(trx, reservationId, status, body || {}, actor);
  });
  audit.updated(actor, 'crm_activity_reservation', reservationId, result.before, result.after, PAGE);
  return result.after;
}

function reservationEvents(reservationId) {
  return db('crm_activity_reservation_event as reservation_event')
    .leftJoin('managers as manager', 'manager.id', 'reservation_event.actor_manager_id')
    .leftJoin('crm_service_center as center', 'center.service_center_id', 'reservation_event.actor_service_center_id')
    .where('reservation_event.reservation_id', reservationId).orderBy('reservation_event.occurred_at')
    .select('reservation_event.*', 'manager.name as manager_name', 'center.service_center_name');
}

/* ------------------------------------------------------------ awards */

async function searchAwards(programId, filters, paging) {
  const qb = function () {
    const query = db('crm_activity_award as award')
      .join('crm_party as party', 'party.party_pk', 'award.party_pk')
      .join('crm_activity_reward as rw', 'rw.reward_id', 'award.reward_id')
      .leftJoin('crm_activity_reservation as reservation', 'reservation.reservation_id', 'award.reservation_id')
      .leftJoin('crm_service_center as center', 'center.service_center_id', 'award.pickup_service_center_id')
      .where('award.activity_program_id', programId);
    if (filters.status) query.where('award.status', filters.status);
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('party.display_name', 'ilike', like).orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)]); });
    }
    return query;
  };
  const count = await qb().count({ total: '*' }).first();
  const rows = await qb()
    .select('award.*', 'party.party_pk', 'party.display_name as party_name', 'rw.reward_name', 'rw.reward_type',
      'reservation.reservation_code', 'center.service_center_name as pickup_location_name')
    .orderBy('award.awarded_at', paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

const AWARD_FLOW = {
  PENDING: ['READY', 'DISPATCHED', 'CREDITED', 'FAILED', 'CANCELLED'],
  READY: ['PICKED_UP', 'DISPATCHED', 'FAILED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  PICKED_UP: [],
  CREDITED: [],
  FAILED: ['PENDING', 'CANCELLED'],
  CANCELLED: []
};

/**
 * ONE REWARD TO ONE PARTY. The reward's stock is taken here, under a lock,
 * and a points reward is paid at once - there is nothing to deliver.
 */
async function award(programId, body, actor) {
  const result = await transaction(async function (trx) {
    const program = await loadProgram(trx, programId);
    requireStatus(program, ['OPEN', 'CLOSED'], 'crm.awardsNeedAnOpenProgram');

    const reward = await trx('crm_activity_reward')
      .where({ reward_id: body.reward_id, activity_program_id: programId }).forUpdate().first();
    if (!reward) throw new HttpError(404, 'common.notFound');
    if (reward.quantity_awarded >= reward.quantity_total) throw new HttpError(409, 'crm.thisRewardIsAllGone');

    let partyId = body.party_pk;
    let reservation = null;
    if (body.reservation_id) {
      reservation = await trx('crm_activity_reservation').where({ reservation_id: body.reservation_id, activity_program_id: programId }).first();
      if (!reservation) throw new HttpError(404, 'common.notFound');
      partyId = reservation.party_pk;
    }
    if (!partyId) throw new HttpError(400, 'crm.chooseACustomer');

    const method = reward.reward_type === 'POINTS' ? 'POINTS'
      : (reward.reward_type === 'WALLET_CREDIT' ? 'WALLET' : (body.fulfilment_method || 'PICKUP'));
    if (method === 'PICKUP' && !body.pickup_service_center_id) throw new HttpError(400, 'crm.chooseWhereItIsCollected');

    const target = await trx('crm_activity_target')
      .where({ activity_program_id: programId, party_pk: partyId }).orderBy('entry_type').first('activity_target_id');

    const [row] = await trx('crm_activity_award').insert({
      activity_program_id: programId,
      reward_id: reward.reward_id,
      party_pk: partyId,
      activity_target_id: target ? target.activity_target_id : null,
      reservation_id: reservation ? reservation.reservation_id : null,
      fulfilment_method: method,
      status: 'PENDING',
      recipient_name: body.recipient_name || null,
      recipient_phone: body.recipient_phone || null,
      delivery_address: body.delivery_address || null,
      delivery_location_pk: body.delivery_location_pk || null,
      pickup_service_center_id: body.pickup_service_center_id || null,
      handled_by_manager_id: actor.manager_id
    }).returning('*');

    await trx('crm_activity_reward').where('reward_id', reward.reward_id)
      .update({ quantity_awarded: reward.quantity_awarded + 1 });

    if (method === 'POINTS') {
      const event = await ledger.post(trx, {
        party_pk: partyId,
        point_type_id: reward.point_type_id,
        event_code: 'PROGRAM_AWARD',
        points_delta: Number(reward.points),
        project_id: program.project_id,
        related_award_id: row.award_id,
        related_reservation_id: row.reservation_id,
        performed_by_manager_id: actor.manager_id,
        description: reward.reward_name
      });
      const [credited] = await trx('crm_activity_award').where('award_id', row.award_id).update({
        status: 'CREDITED', point_event_id: event.point_event_id, fulfilled_at: trx.fn.now()
      }).returning('*');
      return credited;
    }

    return row;
  });

  audit.created(actor, 'crm_activity_award', result.award_id, result, PAGE);
  return result;
}

async function transitionAward(awardId, status, body, actor) {
  const result = await transaction(async function (trx) {
    const current = await trx('crm_activity_award').where('award_id', awardId).forUpdate().first();
    if (!current) throw new HttpError(404, 'common.notFound');

    const allowed = AWARD_FLOW[current.status] || [];
    if (allowed.indexOf(status) === -1) {
      throw new HttpError(409, 'crm.cannotMoveFromTo', null, { from: current.status, to: status });
    }
    if (status === 'CREDITED' && current.fulfilment_method !== 'WALLET') throw new HttpError(409, 'crm.onlyWalletCreditsAreCredited');
    if (status === 'CREDITED' && !body.external_credit_ref) throw new HttpError(400, 'crm.giveTheWalletReference');
    if (status === 'DISPATCHED' && !current.delivery_address && !body.delivery_address) throw new HttpError(400, 'crm.anAddressIsRequired');

    const patch = { status: status, handled_by_manager_id: actor.manager_id };
    if (body.delivery_address) patch.delivery_address = body.delivery_address;
    if (body.external_credit_ref) patch.external_credit_ref = body.external_credit_ref;
    if (['DELIVERED', 'PICKED_UP', 'CREDITED'].indexOf(status) !== -1) patch.fulfilled_at = trx.fn.now();

    if (status === 'CANCELLED') {
      const reward = await trx('crm_activity_reward').where('reward_id', current.reward_id).forUpdate().first();
      await trx('crm_activity_reward').where('reward_id', reward.reward_id)
        .update({ quantity_awarded: Math.max(0, reward.quantity_awarded - 1) });
    }

    /* A prize handed over at a counter is something that counter did. */
    if (status === 'PICKED_UP' && current.pickup_service_center_id) {
      const typeId = await vocabulary.idOf('crm_service_center_activity_type', 'PRIZE_HANDOVER', trx);
      const program = await trx('crm_activity_program').where('activity_program_id', current.activity_program_id).first();
      if (typeId) {
        await trx('crm_service_center_activity').insert({
          service_center_id: current.pickup_service_center_id,
          activity_type_id: typeId,
          project_id: program.project_id,
          occurred_at: trx.fn.now(),
          party_pk: current.party_pk,
          performed_by_manager_id: actor.manager_id,
          related_award_id: current.award_id,
          external_activity_id: 'award:' + current.award_id
        });
      }
    }

    const [after] = await trx('crm_activity_award').where('award_id', awardId).update(patch).returning('*');
    return { before: current, after: after };
  });

  audit.updated(actor, 'crm_activity_award', awardId, result.before, result.after, PAGE);
  return result.after;
}

module.exports = {
  PAGE: PAGE,
  TYPES: TYPES,
  BASES: BASES,
  search: search,
  detail: detail,
  create: create,
  update: update,
  transition: transition,
  saveTier: saveTier,
  removeTier: removeTier,
  addLocation: addLocation,
  removeLocation: removeLocation,
  saveQuota: saveQuota,
  removeQuota: removeQuota,
  saveReward: saveReward,
  removeReward: removeReward,
  searchTargets: searchTargets,
  addTarget: addTarget,
  revokeTarget: revokeTarget,
  buildTargets: buildTargets,
  searchReservations: searchReservations,
  reserve: reserve,
  transitionReservation: transitionReservation,
  reservationEvents: reservationEvents,
  searchAwards: searchAwards,
  award: award,
  transitionAward: transitionAward
};
