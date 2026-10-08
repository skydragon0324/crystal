const crypto = require('crypto');
const db = require('../../config/db');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const ledger = require('./ledger');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');
const { searchId } = require('./partyId');

/**
 * ACTIVITY EVENTS: who may take part, how many times, and what they get.
 *
 * The vendor's new-phone reservations, lotteries, year-end prize services and
 * puzzles were each a table of their own with a comma list of agencies and a
 * normal/reward count. One event here covers all of them:
 *
 *   TARGETS    the people who may take part - built from a segment, a points
 *              ranking, a corporate grade, what they own or what they did at a
 *              site - each with how many entries they are allowed;
 *   QUOTAS     how many entries exist at all, per entry type, tier or site;
 *   RESERVATIONS  the numbered entries themselves, from booking to pickup;
 *   REWARDS and AWARDS  what the event hands out, and to whom.
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

const PAGE = '/admin/crm/events';

const TYPES = ['RESERVATION', 'LOTTERY', 'PRIZE_SERVICE', 'PUZZLE', 'SURVEY_REWARD', 'EVENT_ATTENDANCE'];
const BASES = ['SEGMENT', 'POINT_RANKING', 'CORPORATE_GRADE', 'PRODUCT_REGISTRATION', 'SERVICE_CENTER_ACTIVITY', 'MANUAL', 'IMPORT', 'OPEN'];

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

const COLUMNS = ['event_code', 'event_name', 'event_type', 'project_id', 'description', 'summary',
  'approval_no', 'reserved_product_id', 'eligibility_basis', 'eligibility_segment_id', 'eligibility_rule',
  'ranking_point_type_id', 'ranking_cutoff_at', 'ranking_top_n', 'cost_point_type_id', 'cost_points',
  'number_prefix', 'number_suffix', 'number_start', 'number_end', 'display_at', 'starts_at', 'ends_at',
  'fulfilment_ends_at', 'is_private', 'campaign_id', 'external_system_code', 'is_test'];

/* Fields that may still be changed once the event has been approved. */
const AFTER_APPROVAL = ['description', 'summary', 'display_at', 'fulfilment_ends_at', 'is_private', 'campaign_id'];

function clean(body, columns) {
  const out = {};
  columns.forEach(function (column) {
    if (body[column] === undefined) return;
    let columnValue = body[column] === '' ? null : body[column];
    if (column === 'eligibility_rule' && columnValue && typeof columnValue === 'string') {
      try { columnValue = JSON.parse(columnValue); } catch (error) { throw new HttpError(400, 'crm.common.theRuleIsNotValidJson'); }
    }
    if (column === 'eligibility_rule' && columnValue) columnValue = JSON.stringify(columnValue);
    out[column] = columnValue;
  });
  return out;
}

async function loadEvent(trx, id, lock) {
  const qb = trx('crm_event').where('event_id', id);
  const row = await (lock ? qb.forUpdate() : qb).first();
  if (!row) throw new HttpError(404, 'common.notFound');
  return row;
}

function requireStatus(event, allowed, key) {
  if (allowed.indexOf(event.status) === -1) {
    throw new HttpError(409, key || 'crm.events.notWhileTheEventIs', null, { status: event.status });
  }
}

/* ------------------------------------------------------------ events */

async function search(filters, paging) {
  const qb = function () {
    const query = db('crm_event as event').leftJoin('crm_project as project', 'project.project_id', 'event.project_id');
    if (filters.status) query.where('event.status', filters.status);
    if (filters.event_type) query.where('event.event_type', filters.event_type);
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('event.event_code', 'ilike', like).orWhere('event.event_name', 'ilike', like); });
    }
    return query;
  };

  const count = await qb().count({ total: '*' }).first();
  const sort = { starts_at: 'event.starts_at', event_code: 'event.event_code', created_at: 'event.created_at' }[paging.sort]
    || 'event.event_id';
  const rows = await qb().select('event.*', 'project.project_code',
    db.raw('(SELECT COUNT(*) FROM crm_activity_target target WHERE target.event_id = event.event_id AND target.status <> \'REVOKED\')::int AS target_cnt'),
    db.raw('(SELECT COUNT(*) FROM crm_activity_reservation reservation WHERE reservation.event_id = event.event_id AND reservation.status NOT IN (\'CANCELLED\', \'EXPIRED\', \'FAILED\'))::int AS reservation_cnt'),
    db.raw('(SELECT COUNT(*) FROM crm_activity_award award WHERE award.event_id = event.event_id AND award.status <> \'CANCELLED\')::int AS award_cnt'))
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(count.total) };
}

async function detail(id) {
  const event = await db('crm_event as event')
    .leftJoin('crm_project as project', 'project.project_id', 'event.project_id')
    .leftJoin('crm_segment as segment', 'segment.segment_id', 'event.eligibility_segment_id')
    .leftJoin('crm_point_type as rt', 'rt.point_type_id', 'event.ranking_point_type_id')
    .leftJoin('crm_point_type as ct', 'ct.point_type_id', 'event.cost_point_type_id')
    .leftJoin('crm_product_catalog as pc', 'pc.product_id', 'event.reserved_product_id')
    .leftJoin('managers as mc', 'mc.id', 'event.created_by_manager_id')
    .leftJoin('managers as ma', 'ma.id', 'event.approved_by_manager_id')
    .where('event.event_id', id)
    .first('event.*', 'project.project_code', 'segment.segment_name', 'rt.point_type_code as ranking_point_type_code',
      'ct.point_type_code as cost_point_type_code', 'pc.product_name as reserved_product_name',
      'mc.name as created_by_name', 'ma.name as approved_by_name');
  if (!event) throw new HttpError(404, 'common.notFound');

  const [tiers, locations, quotas, rewards, counts] = await Promise.all([
    db('crm_event_tier').where('event_id', id).orderBy('rank_no'),
    db('crm_event_service_center as event_center')
      .join('crm_service_center as center', 'center.service_center_id', 'event_center.service_center_id')
      .where('event_center.event_id', id).orderBy('center.service_center_name')
      .select('event_center.*', 'center.service_center_code', 'center.service_center_name'),
    db('crm_event_quota as quota')
      .leftJoin('crm_event_tier as tier', 'tier.event_tier_id', 'quota.event_tier_id')
      .leftJoin('crm_service_center as center', 'center.service_center_id', 'quota.service_center_id')
      .where('quota.event_id', id).orderBy('quota.event_quota_id')
      .select('quota.*', 'tier.tier_name', 'center.service_center_name'),
    db('crm_activity_reward as reward')
      .leftJoin('crm_event_tier as tier', 'tier.event_tier_id', 'reward.event_tier_id')
      .leftJoin('crm_point_type as pt', 'pt.point_type_id', 'reward.point_type_id')
      .leftJoin('crm_product_catalog as pc', 'pc.product_id', 'reward.product_id')
      .where('reward.event_id', id).orderBy('reward.sort_order')
      .select('reward.*', 'tier.tier_name', 'pt.point_type_code', 'pc.product_name'),
    db.raw(`SELECT
        (SELECT COUNT(*) FROM crm_activity_target WHERE event_id = ? AND status <> 'REVOKED')::int AS targets,
        (SELECT COALESCE(SUM(allowed_count), 0) FROM crm_activity_target WHERE event_id = ? AND status <> 'REVOKED')::int AS entries_allowed,
        (SELECT COUNT(*) FROM crm_activity_reservation WHERE event_id = ? AND status IN ('RESERVED', 'PAID'))::int AS reservations_open,
        (SELECT COUNT(*) FROM crm_activity_reservation WHERE event_id = ? AND status = 'FULFILLED')::int AS reservations_fulfilled,
        (SELECT COUNT(*) FROM crm_activity_reservation WHERE event_id = ? AND status IN ('CANCELLED', 'EXPIRED', 'FAILED'))::int AS reservations_released,
        (SELECT COUNT(*) FROM crm_activity_award WHERE event_id = ? AND status NOT IN ('CANCELLED', 'FAILED'))::int AS awards`,
    [id, id, id, id, id, id]).then(function (result) { return result.rows[0]; })
  ]);

  return { event: event, tiers: tiers, locations: locations, quotas: quotas, rewards: rewards, counts: counts };
}

async function create(body, actor) {
  const data = clean(body, COLUMNS);
  if (!data.event_code || !data.event_name) throw new HttpError(400, 'crm.common.codeAndNameAreRequired');
  if (TYPES.indexOf(data.event_type) === -1) throw new HttpError(400, 'crm.common.chooseAnEventType');
  if (BASES.indexOf(data.eligibility_basis || '') === -1) throw new HttpError(400, 'crm.events.chooseWhoMayTakePart');

  const [row] = await db('crm_event').insert(Object.assign(data, {
    status: 'DRAFT',
    created_by_manager_id: actor.manager_id
  })).returning('*');

  audit.created(actor, 'crm_event', row.event_id, row, PAGE);
  return row;
}

async function update(id, body, actor) {
  const before = await loadEvent(db, id);
  requireStatus(before, LIVE.concat(['CLOSED']));

  const data = clean(body, before.status === 'DRAFT' ? COLUMNS : AFTER_APPROVAL);
  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const [after] = await db('crm_event').where('event_id', id).update(data).returning('*');
  audit.updated(actor, 'crm_event', id, before, after, PAGE);
  return after;
}

async function transition(id, status, actor) {
  const result = await transaction(async function (trx) {
    const event = await loadEvent(trx, id, true);
    const allowed = FLOW[event.status] || [];
    if (allowed.indexOf(status) === -1) {
      throw new HttpError(409, 'crm.common.cannotMoveFromTo', null, { from: event.status, to: status });
    }

    const patch = { status: status };

    if (status === 'APPROVED') {
      if (String(event.created_by_manager_id) === String(actor.manager_id)) {
        throw new HttpError(409, 'crm.common.anotherManagerMustApprove');
      }
      patch.approved_by_manager_id = actor.manager_id;
      patch.approved_at = trx.fn.now();
    }

    if (status === 'DRAFT') {
      patch.approved_by_manager_id = null;
      patch.approved_at = null;
    }

    if (status === 'TARGETS_FROZEN' && event.eligibility_basis !== 'OPEN') {
      const targets = await trx('crm_activity_target')
        .where('event_id', id).whereNot('status', 'REVOKED').count({ total: '*' }).first();
      if (!Number(targets.total)) throw new HttpError(409, 'crm.events.addTargetsBeforeFreezing');
    }

    if (status === 'FULFILLED') {
      const open = await trx('crm_activity_reservation')
        .where('event_id', id).whereIn('status', ['PENDING', 'RESERVED', 'PAID']).count({ total: '*' }).first();
      if (Number(open.total)) throw new HttpError(409, 'crm.events.reservationsAreStillOpen', null, { n: Number(open.total) });
    }

    if (status === 'CANCELLED') {
      const open = await trx('crm_activity_reservation')
        .where('event_id', id).whereIn('status', ['PENDING', 'RESERVED', 'PAID']).select('reservation_id');
      for (let index = 0; index < open.length; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await moveReservation(trx, open[index].reservation_id, 'CANCELLED', { note: 'Event cancelled' }, actor);
      }
    }

    const [after] = await trx('crm_event').where('event_id', id).update(patch).returning('*');
    return { before: event, after: after };
  });

  audit.updated(actor, 'crm_event', id, result.before, result.after, PAGE);
  return result.after;
}

/* ------------------------------------------------------------ setup: tiers, sites, quotas, rewards */

async function saveTier(eventId, tierId, body, actor) {
  const event = await loadEvent(db, eventId);
  requireStatus(event, SETUP, 'crm.events.tiersAreFixedOnceTargetsAreFrozen');

  const data = {};
  ['tier_code', 'tier_name', 'rank_no', 'min_value', 'max_value', 'entries_per_target',
    'number_range_start', 'number_range_end'].forEach(function (column) {
    if (body[column] !== undefined) data[column] = body[column] === '' ? null : body[column];
  });

  let row;
  if (tierId) {
    [row] = await db('crm_event_tier').where({ event_tier_id: tierId, event_id: eventId })
      .update(data).returning('*');
    if (!row) throw new HttpError(404, 'common.notFound');
  } else {
    [row] = await db('crm_event_tier').insert(Object.assign({ event_id: eventId }, data)).returning('*');
  }
  audit.updated(actor, 'crm_event_tier', row.event_tier_id, null, row, PAGE);
  return row;
}

async function removeTier(eventId, tierId, actor) {
  const event = await loadEvent(db, eventId);
  requireStatus(event, SETUP, 'crm.events.tiersAreFixedOnceTargetsAreFrozen');
  const removed = await db('crm_event_tier').where({ event_tier_id: tierId, event_id: eventId }).del();
  if (!removed) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, 'crm_event_tier', tierId, null, PAGE);
}

async function addLocation(eventId, body, actor) {
  const event = await loadEvent(db, eventId);
  requireStatus(event, LIVE);
  const [row] = await db('crm_event_service_center').insert({
    event_id: eventId,
    service_center_id: body.service_center_id,
    service_center_role: body.service_center_role || 'PICKUP'
  }).returning('*');
  audit.created(actor, 'crm_event_service_center', row.event_service_center_id, row, PAGE);
  return row;
}

async function removeLocation(eventId, locationRowId, actor) {
  const event = await loadEvent(db, eventId);
  requireStatus(event, LIVE);
  const removed = await db('crm_event_service_center').where({ event_service_center_id: locationRowId, event_id: eventId }).del();
  if (!removed) throw new HttpError(404, 'common.notFound');
  audit.deleted(actor, 'crm_event_service_center', locationRowId, null, PAGE);
}

async function saveQuota(eventId, quotaId, body, actor) {
  const event = await loadEvent(db, eventId);
  requireStatus(event, LIVE);

  const data = {};
  ['entry_type', 'event_tier_id', 'service_center_id', 'quota_count'].forEach(function (column) {
    if (body[column] !== undefined) data[column] = body[column] === '' ? null : body[column];
  });

  let row;
  if (quotaId) {
    [row] = await db('crm_event_quota').where({ event_quota_id: quotaId, event_id: eventId })
      .update(data).returning('*');
    if (!row) throw new HttpError(404, 'common.notFound');
  } else {
    [row] = await db('crm_event_quota').insert(Object.assign({ event_id: eventId }, data)).returning('*');
  }
  audit.updated(actor, 'crm_event_quota', row.event_quota_id, null, row, PAGE);
  return row;
}

async function removeQuota(eventId, quotaId, actor) {
  const quota = await db('crm_event_quota').where({ event_quota_id: quotaId, event_id: eventId }).first();
  if (!quota) throw new HttpError(404, 'common.notFound');
  if (quota.used_count > 0) throw new HttpError(409, 'crm.events.thisQuotaIsInUse');
  await db('crm_event_quota').where('event_quota_id', quotaId).del();
  audit.deleted(actor, 'crm_event_quota', quotaId, quota, PAGE);
}

async function saveReward(eventId, rewardId, body, actor) {
  const event = await loadEvent(db, eventId);
  requireStatus(event, LIVE.concat(['CLOSED']));

  const data = {};
  ['event_tier_id', 'reward_name', 'reward_type', 'product_id', 'point_type_id', 'points', 'unit_value',
    'currency_code', 'quantity_total', 'sort_order', 'note'].forEach(function (column) {
    if (body[column] !== undefined) data[column] = body[column] === '' ? null : body[column];
  });

  let row;
  if (rewardId) {
    [row] = await db('crm_activity_reward').where({ reward_id: rewardId, event_id: eventId })
      .update(data).returning('*');
    if (!row) throw new HttpError(404, 'common.notFound');
  } else {
    [row] = await db('crm_activity_reward').insert(Object.assign({ event_id: eventId }, data)).returning('*');
  }
  audit.updated(actor, 'crm_activity_reward', row.reward_id, null, row, PAGE);
  return row;
}

async function removeReward(eventId, rewardId, actor) {
  const reward = await db('crm_activity_reward').where({ reward_id: rewardId, event_id: eventId }).first();
  if (!reward) throw new HttpError(404, 'common.notFound');
  if (reward.quantity_awarded > 0) throw new HttpError(409, 'crm.events.thisRewardHasBeenAwarded');
  await db('crm_activity_reward').where('reward_id', rewardId).del();
  audit.deleted(actor, 'crm_activity_reward', rewardId, reward, PAGE);
}

/* ------------------------------------------------------------ targets */

async function searchTargets(eventId, filters, paging) {
  const qb = function () {
    const query = db('crm_activity_target as target')
      .join('crm_party as party', 'party.party_pk', 'target.party_pk')
      .leftJoin('crm_event_tier as tier', 'tier.event_tier_id', 'target.event_tier_id')
      .where('target.event_id', eventId);
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

async function addTarget(eventId, body, actor) {
  const event = await loadEvent(db, eventId);
  requireStatus(event, SETUP, 'crm.events.targetsAreFrozen');
  if (!body.party_pk) throw new HttpError(400, 'crm.common.chooseACustomer');

  const tiers = await db('crm_event_tier').where('event_id', eventId).orderBy('rank_no');
  const tier = body.event_tier_id
    ? tiers.filter(function (candidateTier) { return String(candidateTier.event_tier_id) === String(body.event_tier_id); })[0]
    : tierFor(tiers, body.qualification_value);

  const [row] = await db('crm_activity_target').insert({
    event_id: eventId,
    party_pk: body.party_pk,
    event_tier_id: tier ? tier.event_tier_id : null,
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

async function revokeTarget(eventId, targetId, actor) {
  const before = await db('crm_activity_target').where({ activity_target_id: targetId, event_id: eventId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.status === 'REVOKED') throw new HttpError(409, 'crm.events.alreadyRevoked');
  const [after] = await db('crm_activity_target').where('activity_target_id', targetId).update({ status: 'REVOKED' }).returning('*');
  audit.updated(actor, 'crm_activity_target', targetId, before, after, PAGE);
  return after;
}

/**
 * BUILD THE TARGET LIST from the event's eligibility basis.
 *
 * Adds whoever qualifies and is not on the list yet; never removes anyone -
 * a manager who added somebody by hand did it on purpose. Each target records
 * what it qualified on (the value, the rank, where it came from), which is
 * what answers "why was I not chosen" afterwards.
 */
async function buildTargets(eventId, actor) {
  const event = await loadEvent(db, eventId);
  requireStatus(event, SETUP, 'crm.events.targetsAreFrozen');

  const rule = typeof event.eligibility_rule === 'string'
    ? JSON.parse(event.eligibility_rule || '{}') : (event.eligibility_rule || {});
  const tiers = await db('crm_event_tier').where('event_id', eventId).orderBy('rank_no');

  let candidates = [];
  let source;

  switch (event.eligibility_basis) {
    case 'SEGMENT':
      source = 'SEGMENT';
      candidates = (await db('crm_segment_membership as membership').join('crm_party as party', 'party.party_pk', 'membership.party_pk')
        .where('membership.segment_id', event.eligibility_segment_id).whereNull('membership.unmatched_at')
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
         ${event.ranking_top_n ? 'LIMIT ' + Number(event.ranking_top_n) : ''}`,
      [event.ranking_point_type_id, event.ranking_cutoff_at]);
      candidates = ranked.rows.map(function (row) {
        return { party_pk: row.party_pk, qualification_value: row.value, qualification_rank: Number(row.rank) };
      });
      break;
    }

    case 'CORPORATE_GRADE': {
      source = 'GRADE';
      const minRank = Number(rule.min_grade_rank || 1);
      const graded = await db.raw(`
        SELECT party.party_pk, grade.rank_no, snapshot.corporate_score
          FROM crm_party party
          LEFT JOIN LATERAL (
                SELECT latest.corporate_grade_id, latest.corporate_score FROM crm_party_analysis_snapshot latest
                 WHERE latest.party_pk = party.party_pk AND latest.project_id IS NULL
                 ORDER BY latest.reference_date DESC LIMIT 1) snapshot ON true
          -- A grade set by hand on the record stands in for the computed one.
          JOIN crm_corporate_grade grade ON grade.corporate_grade_id = COALESCE(party.assigned_grade_id, snapshot.corporate_grade_id)
         WHERE party.party_status = 'ACTIVE'`);
      candidates = graded.rows.filter(function (row) { return Number(row.rank_no) >= minRank; })
        .map(function (row) { return { party_pk: row.party_pk, qualification_value: row.corporate_score }; });
      break;
    }

    case 'PRODUCT_REGISTRATION': {
      source = 'REGISTRATION';
      const classId = rule.product_class_code
        ? await vocabulary.idOf('crm_product_class', rule.product_class_code) : rule.product_class_id;
      if (!classId) throw new HttpError(409, 'crm.events.theRuleNeedsAProductClass');
      const owners = await db('crm_party_product_class_stat as class_stat').join('crm_party as party', 'party.party_pk', 'class_stat.party_pk')
        .where('class_stat.product_class_id', classId).where('class_stat.active_owned_count', '>=', Number(rule.min_count || 1))
        .where('party.party_status', 'ACTIVE')
        .select('class_stat.party_pk', 'class_stat.active_owned_count');
      candidates = owners.map(function (row) { return { party_pk: row.party_pk, qualification_value: row.active_owned_count }; });
      break;
    }

    case 'SERVICE_CENTER_ACTIVITY': {
      source = 'SERVICE_CENTER';
      const typeId = rule.activity_code ? await vocabulary.idOf('crm_service_center_activity_type', rule.activity_code) : null;
      if (!typeId) throw new HttpError(409, 'crm.events.theRuleNeedsAnActivity');
      const since = Number(rule.since_days || 365);
      const visits = await db.raw(`
        SELECT activity.party_pk, COUNT(*) AS value
          FROM crm_service_center_activity activity
          JOIN crm_party party ON party.party_pk = activity.party_pk
         WHERE activity.activity_type_id = ? AND activity.status = 'COMPLETED'
           AND activity.occurred_at >= now() - (? || ' days')::interval
           AND party.party_status = 'ACTIVE'
           AND (NOT EXISTS (SELECT 1 FROM crm_event_service_center event_center WHERE event_center.event_id = ?)
                OR activity.service_center_id IN (SELECT service_center_id FROM crm_event_service_center WHERE event_id = ?))
         GROUP BY activity.party_pk
        HAVING COUNT(*) >= ?`, [typeId, String(since), eventId, eventId, Number(rule.min_count || 1)]);
      candidates = visits.rows.map(function (row) { return { party_pk: row.party_pk, qualification_value: row.value }; });
      break;
    }

    default:
      throw new HttpError(409, 'crm.events.thisBasisHasNothingToBuild');
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
          (event_id, party_pk, event_tier_id, entry_type, allowed_count,
           qualification_value, qualification_rank, qualification_reason, source,
           source_segment_membership_id, added_by_manager_id)
        VALUES (?, ?, ?, 'NORMAL', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (event_id, party_pk, entry_type) DO NOTHING`,
      [eventId, candidate.party_pk, tier ? tier.event_tier_id : null, tier ? tier.entries_per_target : 1,
        candidate.qualification_value === undefined ? null : candidate.qualification_value,
        candidate.qualification_rank || null,
        JSON.stringify({ basis: event.eligibility_basis, rule: rule }),
        source, candidate.source_segment_membership_id || null, actor.manager_id]);
      added += res.rowCount;
    }
  });

  audit.imported(actor, 'crm_activity_target', { event: event.event_code, qualified: candidates.length, added: added }, PAGE);
  return { qualified: candidates.length, added: added };
}

/* ------------------------------------------------------------ reservations */

function reservationQuery() {
  return db('crm_activity_reservation as reservation')
    .join('crm_party as party', 'party.party_pk', 'reservation.party_pk')
    .join('crm_event as event', 'event.event_id', 'reservation.event_id')
    .leftJoin('crm_event_tier as tier', 'tier.event_tier_id', 'reservation.event_tier_id')
    .leftJoin('crm_service_center as center', 'center.service_center_id', 'reservation.service_center_id')
    .leftJoin('crm_product_instance as instance', 'instance.product_instance_id', 'reservation.product_instance_id');
}

async function searchReservations(eventId, filters, paging) {
  const qb = function () {
    const query = reservationQuery().where('reservation.event_id', eventId);
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
  return trx('crm_event_quota')
    .where('event_id', reservation.event_id)
    .where('entry_type', reservation.entry_type)
    .where(function () {
      this.whereNull('event_tier_id');
      if (reservation.event_tier_id) this.orWhere('event_tier_id', reservation.event_tier_id);
    })
    .where(function () {
      this.whereNull('service_center_id');
      if (reservation.service_center_id) this.orWhere('service_center_id', reservation.service_center_id);
    })
    .orderBy('event_quota_id')
    .forUpdate();
}

/**
 * TAKE AN ENTRY - the four checks, all under row locks, then the number.
 *
 *   1. the target still has entries left     (their row is locked)
 *   2. every quota it counts against has room (those rows are locked)
 *   3. the ID card has not already been used in this event
 *   4. the points it costs are there          (the account is locked by the ledger)
 *
 * The event row is locked first, which is what makes the numbering safe:
 * two entries taken at the same moment cannot both read the same "last
 * number". Everything happens or nothing does.
 */
async function reserve(eventId, body, actor) {
  const result = await transaction(async function (trx) {
    const event = await loadEvent(trx, eventId, true);
    requireStatus(event, ['OPEN'], 'crm.events.theEventIsNotOpen');

    const now = new Date();
    if (event.starts_at && now < new Date(event.starts_at)) throw new HttpError(409, 'crm.events.theEventHasNotStarted');
    if (event.ends_at && now > new Date(event.ends_at)) throw new HttpError(409, 'crm.events.theEventHasEnded');

    const entryType = body.entry_type || 'NORMAL';
    const party = await trx('crm_party').where('party_pk', body.party_pk).first();
    if (!party || party.party_status !== 'ACTIVE') throw new HttpError(409, 'crm.common.chooseAnActiveCustomer');

    /* 1. the target */
    let target = null;
    if (event.eligibility_basis !== 'OPEN') {
      target = await trx('crm_activity_target')
        .where({ event_id: eventId, party_pk: party.party_pk, entry_type: entryType })
        .forUpdate().first();
      if (!target || target.status === 'REVOKED') throw new HttpError(409, 'crm.events.thisCustomerIsNotATarget');
      if (target.used_count >= target.allowed_count) throw new HttpError(409, 'crm.events.noEntriesLeft');
    }

    /* The site, which has to be one the event runs at, if it names any. */
    const siteId = body.service_center_id || null;
    const sites = await trx('crm_event_service_center').where('event_id', eventId);
    if (siteId && sites.length && !sites.some(function (eventSite) { return String(eventSite.service_center_id) === String(siteId); })) {
      throw new HttpError(409, 'crm.events.thatSiteIsNotInThisEvent');
    }

    const tierId = target ? target.event_tier_id : null;
    const tier = tierId ? await trx('crm_event_tier').where('event_tier_id', tierId).first() : null;

    /* 2. the quotas */
    const quotas = await matchingQuotas(trx, {
      event_id: eventId, entry_type: entryType, event_tier_id: tierId, service_center_id: siteId
    });
    const full = quotas.filter(function (quota) { return quota.used_count >= quota.quota_count; })[0];
    if (full) throw new HttpError(409, 'crm.events.theQuotaIsFull');

    /* 3. the ID card */
    const cardHash = hashIdCard(body.holder_id_card);
    if (cardHash) {
      const used = await trx('crm_activity_reservation')
        .where({ event_id: eventId, holder_id_card_hash: cardHash })
        .whereNotIn('status', ['CANCELLED', 'EXPIRED', 'FAILED']).first('reservation_id');
      if (used) throw new HttpError(409, 'crm.events.thisIdCardHasAnEntry');
    }

    /* The number: the next one in the tier's range, or the event's. */
    const start = tier && tier.number_range_start !== null ? tier.number_range_start
      : (event.number_start !== null ? event.number_start : 1);
    const end = tier && tier.number_range_end !== null ? tier.number_range_end : event.number_end;

    const last = await trx('crm_activity_reservation')
      .where('event_id', eventId)
      .where('reservation_no', '>=', start)
      .modify(function (qb) { if (end !== null && end !== undefined) qb.where('reservation_no', '<=', end); })
      .max({ last_no: 'reservation_no' }).first();
    const number = last && last.last_no !== null ? Number(last.last_no) + 1 : Number(start);
    if (end !== null && end !== undefined && number > Number(end)) throw new HttpError(409, 'crm.events.noNumbersLeft');

    /* reservation_code is 30 characters, so a long event code is shortened for the default prefix. */
    const width = String(end || Math.max(number, 9999)).length;
    const prefix = event.number_prefix || (String(event.event_code).slice(0, 14) + '-');
    const code = prefix + String(number).padStart(width, '0') + (event.number_suffix || '');

    const [reservation] = await trx('crm_activity_reservation').insert({
      event_id: eventId,
      activity_target_id: target ? target.activity_target_id : null,
      party_pk: party.party_pk,
      event_tier_id: tierId,
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
    if (event.cost_point_type_id && Number(event.cost_points) > 0) {
      await ledger.post(trx, {
        party_pk: party.party_pk,
        point_type_id: event.cost_point_type_id,
        event_code: 'RESERVATION_COST',
        points_delta: -Number(event.cost_points),
        project_id: event.project_id,
        related_reservation_id: reservation.reservation_id,
        performed_by_manager_id: actor.manager_id,
        performed_by_service_center_id: siteId,
        description: event.event_name
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
      await trx('crm_event_quota').where('event_quota_id', quotas[index].event_quota_id)
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
    throw new HttpError(409, 'crm.common.cannotMoveFromTo', null, { from: reservation.status, to: status });
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
      const event = await trx('crm_event').where('event_id', reservation.event_id).first();
      if (typeId) {
        await trx('crm_service_center_activity').insert({
          service_center_id: siteId,
          activity_type_id: typeId,
          project_id: event.project_id,
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
      await trx('crm_event_quota').where('event_quota_id', quotas[index].event_quota_id)
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

async function searchAwards(eventId, filters, paging) {
  const qb = function () {
    const query = db('crm_activity_award as award')
      .join('crm_party as party', 'party.party_pk', 'award.party_pk')
      .join('crm_activity_reward as rw', 'rw.reward_id', 'award.reward_id')
      .leftJoin('crm_activity_reservation as reservation', 'reservation.reservation_id', 'award.reservation_id')
      .leftJoin('crm_service_center as center', 'center.service_center_id', 'award.pickup_service_center_id')
      .where('award.event_id', eventId);
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
async function award(eventId, body, actor) {
  const result = await transaction(async function (trx) {
    const event = await loadEvent(trx, eventId);
    requireStatus(event, ['OPEN', 'CLOSED'], 'crm.events.awardsNeedAnOpenEvent');

    const reward = await trx('crm_activity_reward')
      .where({ reward_id: body.reward_id, event_id: eventId }).forUpdate().first();
    if (!reward) throw new HttpError(404, 'common.notFound');
    if (reward.quantity_awarded >= reward.quantity_total) throw new HttpError(409, 'crm.events.thisRewardIsAllGone');

    let partyId = body.party_pk;
    let reservation = null;
    if (body.reservation_id) {
      reservation = await trx('crm_activity_reservation').where({ reservation_id: body.reservation_id, event_id: eventId }).first();
      if (!reservation) throw new HttpError(404, 'common.notFound');
      partyId = reservation.party_pk;
    }
    if (!partyId) throw new HttpError(400, 'crm.common.chooseACustomer');

    const method = reward.reward_type === 'POINTS' ? 'POINTS'
      : (reward.reward_type === 'WALLET_CREDIT' ? 'WALLET' : (body.fulfilment_method || 'PICKUP'));
    if (method === 'PICKUP' && !body.pickup_service_center_id) throw new HttpError(400, 'crm.events.chooseWhereItIsCollected');

    const target = await trx('crm_activity_target')
      .where({ event_id: eventId, party_pk: partyId }).orderBy('entry_type').first('activity_target_id');

    const [row] = await trx('crm_activity_award').insert({
      event_id: eventId,
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
      const pointEvent = await ledger.post(trx, {
        party_pk: partyId,
        point_type_id: reward.point_type_id,
        event_code: 'EVENT_AWARD',
        points_delta: Number(reward.points),
        project_id: event.project_id,
        related_award_id: row.award_id,
        related_reservation_id: row.reservation_id,
        performed_by_manager_id: actor.manager_id,
        description: reward.reward_name
      });
      const [credited] = await trx('crm_activity_award').where('award_id', row.award_id).update({
        status: 'CREDITED', point_event_id: pointEvent.point_event_id, fulfilled_at: trx.fn.now()
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
      throw new HttpError(409, 'crm.common.cannotMoveFromTo', null, { from: current.status, to: status });
    }
    if (status === 'CREDITED' && current.fulfilment_method !== 'WALLET') throw new HttpError(409, 'crm.events.onlyWalletCreditsAreCredited');
    if (status === 'CREDITED' && !body.external_credit_ref) throw new HttpError(400, 'crm.events.giveTheWalletReference');
    if (status === 'DISPATCHED' && !current.delivery_address && !body.delivery_address) throw new HttpError(400, 'crm.events.anAddressIsRequired');

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
      const event = await trx('crm_event').where('event_id', current.event_id).first();
      if (typeId) {
        await trx('crm_service_center_activity').insert({
          service_center_id: current.pickup_service_center_id,
          activity_type_id: typeId,
          project_id: event.project_id,
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
