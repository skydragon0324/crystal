const db = require('../../config/db');
const config = require('../../config');
const remote = require('../../repositories/remote/smartphoneOffline.api');
const audit = require('../audit.service');
const memberships = require('./memberships.service');
const rewardPoints = require('./rewardPoints.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

const PAGE = '/admin/crm/customers';
/* Conflicts and failures a job keeps to show; the counts are always complete, and every failure is kept in the failure table. */
const KEEP = 200;

/**
 * CUSTOMERS LINKED TO THE SMARTPHONE_OFFLINE SYSTEM BY PHONE.
 *
 * There, one mobile number is one user, and a user carries little more than
 * the number. So the rule is simply: a user who has one of a customer's phone
 * numbers IS that customer, and becomes one of their project accounts (its ID
 * as Account ID, its PK when it has one). A customer with two numbers can end
 * up with two accounts there.
 *
 * Per phone number:
 *   already linked by that number            not asked again       skipped
 *   nobody has it                                                  not_found
 *   the user is linked to this customer      PK and phone filled   existing
 *   the user is linked to another customer   left alone, reported  conflicts
 *   the user was unlinked from this customer left alone (a manager decided)   unlinked_before
 *   otherwise                                linked (EXACT)        linked
 *   the system could not be asked                                  failed
 */

async function project() {
  const row = await db('crm_project').where('project_code', config.smartphoneOffline.projectCode).first();
  if (!row) throw new HttpError(409, 'crm.smartphoneOffline.noProject', null, { code: config.smartphoneOffline.projectCode });
  return row;
}

function available() {
  if (remote.mode() === 'off') throw new HttpError(409, 'crm.smartphoneOffline.notConfigured');
}

function emptySummary() {
  return { customers: 0, phones: 0, skipped: 0, not_found: 0, existing: 0, linked: 0, unlinked_before: 0, conflicts: [], failed: [] };
}

/** One customer's distinct active phone numbers, normalised. */
function phonesOf(partyPk) {
  return db('crm_contact_point').where('party_pk', partyPk).whereIn('contact_type', ['MOBILE', 'PHONE']).where('status', 'ACTIVE')
    .whereNotNull('normalized_value').whereNot('normalized_value', '').distinct('normalized_value').pluck('normalized_value');
}

/** One user of the mobile system, found by one of the customer's numbers, made (or confirmed as) their account. */
async function attach(partyPk, projectId, phone, user, summary, actor) {
  try {
    await transaction(async function (trx) {
      const active = await trx('crm_project_account').where({ project_id: projectId, external_account_id: user.user_id }).whereNull('unlinked_at').forUpdate().first();
      if (active) {
        if (String(active.party_pk) !== String(partyPk)) {
          if (summary.conflicts.length < KEEP) summary.conflicts.push({ party_pk: String(partyPk), phone: phone, user_id: user.user_id, linked_party_pk: String(active.party_pk) });
          summary.conflict_count = (summary.conflict_count || 0) + 1;
          return;
        }
        const fill = {};
        if (!active.matched_phone) fill.matched_phone = phone;
        if (!active.external_account_pk && user.user_pk) fill.external_account_pk = user.user_pk;
        if (Object.keys(fill).length) await trx('crm_project_account').where('project_account_id', active.project_account_id).update(fill);
        summary.existing += 1;
        return;
      }
      const dropped = await trx('crm_project_account').where({ project_id: projectId, external_account_id: user.user_id, party_pk: partyPk }).whereNotNull('unlinked_at').first();
      if (dropped) { summary.unlinked_before += 1; return; }
      const primary = await trx('crm_project_account').where({ party_pk: partyPk, project_id: projectId }).whereNull('unlinked_at').first();
      const [row] = await trx('crm_project_account').insert({
        party_pk: partyPk, project_id: projectId, external_account_id: user.user_id, external_account_pk: user.user_pk,
        external_account_type: 'MOBILE_USER', matched_phone: phone, is_primary: !primary,
        link_method: 'EXACT', link_confidence: 1
      }).returning('*');
      audit.created(actor, 'crm_project_account', row.project_account_id, row, PAGE);
      summary.linked += 1;
    });
  } catch (error) {
    // Linked to someone else a moment ago, by another run or registration.
    if (error.code !== '23505') throw error;
    summary.conflict_count = (summary.conflict_count || 0) + 1;
    if (summary.conflicts.length < KEEP) summary.conflicts.push({ party_pk: String(partyPk), phone: phone, user_id: user.user_id, linked_party_pk: null });
  }
}

/**
 * Every phone of some customers, looked up and linked. Their numbers, and the
 * ones already linked, are read in two queries for all of them; the numbers not
 * linked yet go to the system together (getUserByPhone takes many per request -
 * see smartphoneOffline.api findByPhones, which also retries and paces). Adds to
 * `summary`; every number that could not be looked up is also put in
 * `failures`, when given, for a job to keep.
 */
async function linkMany(parties, projectId, summary, actor, failures) {
  const pks = parties.map(function (party) { return party.party_pk; });
  summary.customers += pks.length;
  if (!pks.length) return;

  const [numbers, linked] = await Promise.all([
    db('crm_contact_point').whereIn('party_pk', pks).whereIn('contact_type', ['MOBILE', 'PHONE']).where('status', 'ACTIVE')
      .whereNotNull('normalized_value').whereNot('normalized_value', '').distinct('party_pk', 'normalized_value'),
    db('crm_project_account').where('project_id', projectId).whereIn('party_pk', pks).whereNull('unlinked_at').whereNotNull('matched_phone')
      .select('party_pk', 'matched_phone')
  ]);
  const isLinked = {};
  linked.forEach(function (row) { isLinked[row.party_pk + ':' + row.matched_phone] = true; });
  const asks = [];
  numbers.forEach(function (row) {
    summary.phones += 1;
    if (isLinked[row.party_pk + ':' + row.normalized_value]) summary.skipped += 1;
    else asks.push({ party_pk: row.party_pk, phone: row.normalized_value });
  });
  if (!asks.length) return;

  const digits = function (value) { return String(value || '').replace(/\D/g, ''); };
  let found;
  try {
    found = await remote.findByPhones(asks.map(function (ask) { return ask.phone; }));
  } catch (error) {
    found = { users: [], failed: asks.map(function (ask) { return { phone: digits(ask.phone), error: error.message }; }) };
  }
  const failedOf = {};
  found.failed.forEach(function (row) { failedOf[row.phone] = row.error || 'failed'; });
  const byPhone = {};
  found.users.forEach(function (user) { (byPhone[user.phone] = byPhone[user.phone] || []).push(user); });

  for (let index = 0; index < asks.length; index += 1) {
    const ask = asks[index];
    const key = digits(ask.phone);
    if (failedOf[key] !== undefined) {
      summary.failed_count = (summary.failed_count || 0) + 1;
      if (summary.failed.length < KEEP) summary.failed.push({ party_pk: String(ask.party_pk), phone: ask.phone, error: failedOf[key] });
      if (failures) failures.push({ party_pk: ask.party_pk, phone: ask.phone, error: failedOf[key] });
      continue;
    }
    const users = byPhone[key] || [];
    if (!users.length) { summary.not_found += 1; continue; }
    for (let user = 0; user < users.length; user += 1) {
      // eslint-disable-next-line no-await-in-loop
      await attach(ask.party_pk, projectId, ask.phone, users[user], summary, actor);
    }
  }
}

function finished(summary) {
  return Object.assign({}, summary, {
    conflict_count: summary.conflict_count || 0,
    failed_count: summary.failed_count || 0
  });
}

/** The Accounts tab's Auto-link: one customer, now. */
async function linkParty(partyPk, actor) {
  available();
  const target = await project();
  const party = await db('crm_party').where('party_pk', partyPk).first('party_pk', 'party_status');
  if (!party) throw new HttpError(404, 'common.notFound');
  if (party.party_status === 'MERGED') throw new HttpError(409, 'crm.common.thisPartyWasMerged');
  const summary = emptySummary();
  await linkMany([party], target.project_id, summary, actor);
  return finished(summary);
}

/* ------------------------------------------------------------ linking jobs */

/*
 * LINKING EVERY CUSTOMER - hundreds of thousands - in one click, as a JOB.
 *
 * A job is a row (crm_smartphone_offline_job), not a run in this process's
 * memory. It covers ALL customers with a phone number, a RANGE of customer
 * numbers, or - RETRY - the customers whose numbers an earlier job could not
 * look up. It goes through them in customer-number order, a chunk at a time
 * (config jobChunk): reads the chunk's numbers, looks them up together, links
 * what is found, and saves where it got to (last_party_pk) and its counts.
 * So:
 *
 *   it is never all in memory     the next chunk is "after the last one done"
 *   a restart loses one chunk     resumeJobs() at start-up, or the next status
 *                                 call, takes a RUNNING job up again from its
 *                                 last saved chunk; numbers linked are skipped
 *   one at a time                 a unique index allows one RUNNING / PAUSED
 *   it can be paused, resumed     between chunks, by its status
 *   and cancelled
 *   failures are kept             every number not looked up, in
 *                                 crm_smartphone_offline_job_failure, for a
 *                                 RETRY job to ask about again
 */
const JOBS = 'crm_smartphone_offline_job';
const FAILURES = 'crm_smartphone_offline_job_failure';
const ACTIVE = ['RUNNING', 'PAUSED'];
const SCOPES = ['ALL', 'RANGE', 'RETRY'];
/* Jobs this process is working through now: a job is worked by one loop at a time. */
const working = new Set();

function publicJob(row) {
  if (!row) return null;
  return {
    job_id: String(row.job_id), scope: row.scope, status: row.status,
    from_party_pk: row.from_party_pk == null ? null : String(row.from_party_pk),
    to_party_pk: row.to_party_pk == null ? null : String(row.to_party_pk),
    retry_of_job_id: row.retry_of_job_id == null ? null : String(row.retry_of_job_id),
    total: Number(row.total) || 0, done: Number(row.done) || 0,
    last_party_pk: row.last_party_pk == null ? null : String(row.last_party_pk),
    started_at: row.started_at, updated_at: row.updated_at, finished_at: row.finished_at, error: row.error,
    summary: finished(Object.assign(emptySummary(), row.summary || {}))
  };
}

/** The customers a job covers: live, with a phone number, in its range or among the earlier job's failures. */
function covered(job) {
  const qb = db('crm_party as party').whereIn('party.party_status', ['ACTIVE', 'INACTIVE'])
    .whereExists(function () {
      this.select(db.raw(1)).from('crm_contact_point as phone').whereRaw('phone.party_pk = party.party_pk')
        .whereIn('phone.contact_type', ['MOBILE', 'PHONE']).where('phone.status', 'ACTIVE');
    });
  if (job.scope === 'RANGE') qb.whereBetween('party.party_pk', [job.from_party_pk, job.to_party_pk]);
  if (job.scope === 'RETRY') {
    qb.whereExists(function () {
      this.select(db.raw(1)).from(FAILURES + ' as failure').whereRaw('failure.party_pk = party.party_pk').where('failure.job_id', job.retry_of_job_id);
    });
  }
  return qb;
}

/**
 * Start a job: { scope: 'ALL' }, { scope: 'RANGE', from_party_pk, to_party_pk }
 * or { scope: 'RETRY', retry_of_job_id }. Answers at once; the job goes on in
 * the background and is followed with getJob().
 */
async function startJob(body, actor) {
  const input = body || {};
  const scope = SCOPES.indexOf(input.scope) !== -1 ? input.scope : (input.from_party_pk || input.to_party_pk ? 'RANGE' : 'ALL');
  const draft = { scope: scope, from_party_pk: null, to_party_pk: null, retry_of_job_id: null };
  if (scope === 'RANGE') {
    const from = String(input.from_party_pk || '').trim();
    const to = String(input.to_party_pk || '').trim();
    if (!/^[1-9][0-9]*$/.test(from) || !/^[1-9][0-9]*$/.test(to)) throw new HttpError(400, 'crm.smartphoneOffline.chooseARange');
    if (BigInt(from) > BigInt(to)) throw new HttpError(400, 'crm.smartphoneOffline.rangeIsBackwards');
    draft.from_party_pk = from;
    draft.to_party_pk = to;
  }
  if (scope === 'RETRY') {
    const earlier = /^[1-9][0-9]*$/.test(String(input.retry_of_job_id || '')) ? await db(JOBS).where('job_id', input.retry_of_job_id).first() : null;
    if (!earlier) throw new HttpError(404, 'common.notFound');
    if (ACTIVE.indexOf(earlier.status) !== -1) throw new HttpError(409, 'crm.smartphoneOffline.runInProgress');
    draft.retry_of_job_id = earlier.job_id;
  }
  available();
  await project();
  if (await db(JOBS).whereIn('status', ACTIVE).first('job_id')) throw new HttpError(409, 'crm.smartphoneOffline.runInProgress');

  const total = Number((await covered(draft).count({ c: '*' }).first()).c);
  if (!total) throw new HttpError(400, scope === 'RETRY' ? 'crm.smartphoneOffline.nothingToRetry' : 'crm.smartphoneOffline.noCustomersInRange');

  let row;
  try {
    [row] = await db(JOBS).insert(Object.assign({}, draft, {
      status: 'RUNNING', total: total, summary: JSON.stringify(emptySummary()), started_by_manager_id: (actor && actor.manager_id) || null
    })).returning('*');
  } catch (error) {
    if (error.code === '23505') throw new HttpError(409, 'crm.smartphoneOffline.runInProgress');
    throw error;
  }
  audit.created(actor, JOBS, row.job_id, publicJob(row), PAGE);
  work(row.job_id, actor);
  return publicJob(row);
}

/**
 * The job's loop, a chunk at a time, while it is RUNNING. Its progress is saved
 * after each chunk, and its status read before the next - so a pause or a
 * cancel takes effect between chunks, and a server stopped part-way loses at
 * most the chunk it was on.
 */
async function work(jobId, actor) {
  const key = String(jobId);
  if (working.has(key)) return;
  working.add(key);
  try {
    const target = await project();
    const size = Math.max(1, config.smartphoneOffline.jobChunk);
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const job = await db(JOBS).where('job_id', jobId).first();
      if (!job || job.status !== 'RUNNING') return;
      const chunkQuery = covered(job).orderBy('party.party_pk').limit(size).select('party.party_pk');
      if (job.last_party_pk) chunkQuery.where('party.party_pk', '>', job.last_party_pk);
      // eslint-disable-next-line no-await-in-loop
      const chunk = await chunkQuery;
      if (!chunk.length) {
        // eslint-disable-next-line no-await-in-loop
        await db(JOBS).where({ job_id: jobId, status: 'RUNNING' })
          .update({ status: 'DONE', total: db.raw('GREATEST(total, done)'), finished_at: db.fn.now(), updated_at: db.fn.now() });
        return;
      }
      const summary = Object.assign(emptySummary(), job.summary || {});
      const failures = [];
      // eslint-disable-next-line no-await-in-loop
      await linkMany(chunk, target.project_id, summary, actor, failures);
      for (let start = 0; start < failures.length; start += 500) {
        // eslint-disable-next-line no-await-in-loop
        await db(FAILURES).insert(failures.slice(start, start + 500).map(function (failure) {
          return { job_id: jobId, party_pk: failure.party_pk, phone: String(failure.phone).slice(0, 50), error: failure.error ? String(failure.error).slice(0, 500) : null };
        }));
      }
      // eslint-disable-next-line no-await-in-loop
      await db(JOBS).where('job_id', jobId).update({
        done: Number(job.done) + chunk.length, last_party_pk: chunk[chunk.length - 1].party_pk,
        summary: JSON.stringify(summary), updated_at: db.fn.now()
      });
    }
  } catch (error) {
    await db(JOBS).where('job_id', jobId).whereIn('status', ACTIVE)
      .update({ status: 'FAILED', error: String(error.message).slice(0, 1000), finished_at: db.fn.now(), updated_at: db.fn.now() })
      .catch(function () {});
  } finally {
    working.delete(key);
    const after = await db(JOBS).where('job_id', jobId).first().catch(function () { return null; });
    if (after && (after.status === 'DONE' || after.status === 'FAILED')) audit.updated(actor, JOBS, jobId, null, publicJob(after), PAGE);
  }
}

/** Pause, resume or cancel a job - taking effect between chunks. */
async function setJobState(id, action, actor) {
  const job = /^[1-9][0-9]*$/.test(String(id || '')) ? await db(JOBS).where('job_id', id).first() : null;
  if (!job) throw new HttpError(404, 'common.notFound');
  const allowed = { pause: ['RUNNING'], resume: ['PAUSED'], cancel: ACTIVE }[action];
  if (!allowed) throw new HttpError(400, 'crm.common.notAStatusYouCanSet');
  if (allowed.indexOf(job.status) === -1) throw new HttpError(409, 'crm.smartphoneOffline.jobIsNot', null, { status: job.status });
  const patch = { status: { pause: 'PAUSED', resume: 'RUNNING', cancel: 'CANCELLED' }[action], updated_at: db.fn.now() };
  if (action === 'cancel') patch.finished_at = db.fn.now();
  const [after] = await db(JOBS).where({ job_id: job.job_id, status: job.status }).update(patch).returning('*');
  if (!after) throw new HttpError(409, 'crm.smartphoneOffline.jobIsNot', null, { status: job.status });
  audit.updated(actor, JOBS, job.job_id, publicJob(job), publicJob(after), PAGE);
  if (action === 'resume') work(after.job_id, actor);
  return publicJob(after);
}

async function getJob(id) {
  const job = /^[1-9][0-9]*$/.test(String(id || '')) ? await db(JOBS).where('job_id', id).first() : null;
  if (!job) throw new HttpError(404, 'common.notFound');
  if (job.status === 'RUNNING' && !working.has(String(job.job_id))) work(job.job_id, null);
  return publicJob(job);
}

/** At start-up: a job left RUNNING by a server that stopped is taken up again from its last saved chunk. */
async function resumeJobs() {
  const jobs = await db(JOBS).where('status', 'RUNNING').select('job_id');
  jobs.forEach(function (job) { work(job.job_id, null); });
  return jobs.length;
}

/** What the Customers page needs before it offers a job: the project, whether the system is reachable, the active job, the last one. */
async function status() {
  const row = await db('crm_project').where('project_code', config.smartphoneOffline.projectCode).first('project_id', 'project_name');
  const [active, last] = await Promise.all([
    db(JOBS).whereIn('status', ACTIVE).first(),
    db(JOBS).whereNotIn('status', ACTIVE).orderBy('job_id', 'desc').first()
  ]);
  /* A RUNNING job nobody is working on - the server restarted - is taken up again. */
  if (active && active.status === 'RUNNING' && !working.has(String(active.job_id))) work(active.job_id, null);
  return {
    mode: remote.mode(), project: row || null, project_code: config.smartphoneOffline.projectCode,
    chunk: config.smartphoneOffline.jobChunk, active: publicJob(active), last: publicJob(last)
  };
}

/**
 * The mobile devices registered to a customer in SMARTPHONE_OFFLINE: every
 * linked SMARTPHONE_OFFLINE Account ID of theirs is a master id, and the
 * system is asked for all of them at once. The Products tab shows these;
 * the CRM keeps none of it.
 */
async function devicesOfParty(partyPk) {
  const row = await db('crm_project').where('project_code', config.smartphoneOffline.projectCode).first('project_id', 'project_code', 'project_name');
  if (!row) return { project: null, accounts: [], items: [] };
  const accounts = await db('crm_project_account').where({ party_pk: partyPk, project_id: row.project_id }).whereNull('unlinked_at')
    .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'project_account_id' }]).select('project_account_id', 'external_account_id', 'external_account_pk');
  if (!accounts.length) return { project: row, accounts: [], items: [] };
  try {
    const found = await remote.devices(accounts.map(function (account) { return account.external_account_id; }));
    return { project: row, accounts: accounts, items: found.items };
  } catch (error) {
    return { project: row, accounts: accounts, items: [], failed: error.message };
  }
}

/**
 * The service history of the customer's devices in SMARTPHONE_OFFLINE - asked,
 * like the devices, by every linked SMARTPHONE_OFFLINE Account ID at once.
 * The Service tab shows it; the CRM keeps none of it.
 */
async function servicesOfParty(partyPk) {
  const row = await db('crm_project').where('project_code', config.smartphoneOffline.projectCode).first('project_id', 'project_code', 'project_name');
  if (!row) return { project: null, accounts: [], items: [] };
  const accounts = await db('crm_project_account').where({ party_pk: partyPk, project_id: row.project_id }).whereNull('unlinked_at')
    .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'project_account_id' }]).select('project_account_id', 'external_account_id', 'external_account_pk');
  if (!accounts.length) return { project: row, accounts: [], items: [] };
  try {
    const found = await remote.services(accounts.map(function (account) { return account.external_account_id; }));
    return { project: row, accounts: accounts, items: found.items };
  } catch (error) {
    return { project: row, accounts: accounts, items: [], failed: error.message };
  }
}

/**
 * The privileges of the customer's devices in SMARTPHONE_OFFLINE - asked, like
 * the devices and the service history, by every linked SMARTPHONE_OFFLINE
 * Account ID at once. The Privileges tab shows them; the CRM keeps none.
 */
async function privilegesOfParty(partyPk) {
  const row = await db('crm_project').where('project_code', config.smartphoneOffline.projectCode).first('project_id', 'project_code', 'project_name');
  if (!row) return { project: null, accounts: [], items: [] };
  const accounts = await db('crm_project_account').where({ party_pk: partyPk, project_id: row.project_id }).whereNull('unlinked_at')
    .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'project_account_id' }]).select('project_account_id', 'external_account_id', 'external_account_pk');
  if (!accounts.length) return { project: row, accounts: [], items: [] };
  try {
    const found = await remote.privileges(accounts.map(function (account) { return account.external_account_id; }));
    return { project: row, accounts: accounts, items: found.items };
  } catch (error) {
    return { project: row, accounts: accounts, items: [], failed: error.message };
  }
}

/* ------------------------------------------------------------ levels, grades and points (getLevelInfo) */

/*
 * The system ranks each user twice and keeps their points, and getLevelInfo
 * says all three for a set of master ids. Two buttons on the Accounts tab
 * read it for one customer's linked accounts:
 *
 *   Sync levels / grades   each account put on its LEVEL and its GRADE tier,
 *                          the step kept in the tier history:
 *                            LEVEL  worked out here from reward_point - the
 *                                   level tier with the highest From value
 *                                   (min_value) at or below the points.
 *                                   The system's loyal_level is not used.
 *                            GRADE  purchase_level, as sent: the grade tier
 *                                   whose Code in the project (source_code)
 *                                   is that value
 *   Sync points            reward_point -> the account's reward points, as a
 *                          figure the project sent (crm_reward_points, API)
 *
 * Nothing is guessed. Points below every level's From value (or levels with
 * none set), or a grade no tier has the code of, are reported, and the tier is
 * set up in Settings > Project tiers.
 */
const SYNC_REASON = 'Synced from SMARTPHONE_OFFLINE';

/** The level the points reach: the active LEVEL tier with the highest From value at or below them; null below every one. */
function levelForPoints(tiers, points) {
  if (points === null || points === undefined || isNaN(Number(points))) return null;
  return tiers.filter(function (tier) {
    return tier.tier_kind === 'LEVEL' && tier.min_value !== null && tier.min_value !== undefined && Number(tier.min_value) <= Number(points);
  }).sort(function (a, b) {
    return (Number(b.min_value) - Number(a.min_value)) || ((Number(b.rank_no) || 0) - (Number(a.rank_no) || 0));
  })[0] || null;
}

/* What each kind is read from, and how its tier is found. `by` is what a report of a missing tier says it was looking for. */
const RANKS = [
  { kind: 'LEVEL', by: 'POINTS', value: function (item) { return item.reward_point; }, tierOf: levelForPoints },
  { kind: 'GRADE', by: 'CODE', value: function (item) { return item.purchase_level; },
    tierOf: function (tiers, value) { return memberships.tierByCode(tiers, 'GRADE', value); } }
];

/** The customer's live accounts in the system, and getLevelInfo's item for each by master id. */
async function levelsOf(partyPk) {
  available();
  const target = await project();
  const accounts = await db('crm_project_account').where({ party_pk: partyPk, project_id: target.project_id }).whereNull('unlinked_at')
    .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'project_account_id' }]).select('project_account_id', 'external_account_id');
  if (!accounts.length) throw new HttpError(409, 'crm.smartphoneOffline.noAccounts');
  let found;
  try {
    found = await remote.levels(accounts.map(function (account) { return account.external_account_id; }));
  } catch (error) {
    throw new HttpError(502, 'crm.smartphoneOffline.couldNotAsk', null, { error: error.message });
  }
  const byId = {};
  found.items.forEach(function (item) { byId[String(item.master_id)] = item; });
  return { project: target, accounts: accounts, byId: byId };
}

/**
 * Sync levels / grades: every linked account on its LEVEL tier - worked out from its reward_point, always;
 * the system's loyal_level is never read - and on its GRADE tier, from purchase_level (see RANKS).
 */
async function syncLevels(partyPk, actor) {
  const asked = await levelsOf(partyPk);
  const tiers = await db('crm_project_tier').where({ project_id: asked.project.project_id, is_active: true })
    .whereIn('tier_kind', RANKS.map(function (rank) { return rank.kind; }));
  const summary = { accounts: asked.accounts.length, created: 0, changed: 0, unchanged: 0, not_found: [], unknown: [] };

  for (let index = 0; index < asked.accounts.length; index += 1) {
    const account = asked.accounts[index];
    const item = asked.byId[String(account.external_account_id)];
    if (!item) { summary.not_found.push(account.external_account_id); continue; }
    for (let step = 0; step < RANKS.length; step += 1) {
      const rank = RANKS[step];
      const value = rank.value(item);
      if (value === null || value === undefined) continue;
      const tier = rank.tierOf(tiers, value);
      if (!tier) { summary.unknown.push({ external_account_id: account.external_account_id, tier_kind: rank.kind, by: rank.by, value: value }); continue; }
      // eslint-disable-next-line no-await-in-loop
      const result = await transaction(function (trx) { return memberships.placeOn(trx, account.project_account_id, tier, SYNC_REASON); });
      summary[result.status.toLowerCase()] += 1;
      if (result.status === 'CREATED') audit.created(actor, 'crm_membership', result.after.membership_id, result.after, PAGE);
      if (result.status === 'CHANGED') audit.updated(actor, 'crm_membership', result.after.membership_id, result.before, result.after, PAGE);
    }
  }
  return summary;
}

/** Sync points: each linked account's reward points, as the system holds them now. */
async function syncPoints(partyPk, actor) {
  const asked = await levelsOf(partyPk);
  /* A figure the system still holds is left alone: re-stamped "as of now" it would read as a change. */
  const stored = {};
  (await db('crm_reward_points').whereIn('project_account_id', asked.accounts.map(function (account) { return account.project_account_id; }))
    .select('project_account_id', 'points')).forEach(function (row) { stored[String(row.project_account_id)] = Number(row.points); });
  const notFound = [];
  const items = [];
  let same = 0;
  asked.accounts.forEach(function (account) {
    const item = asked.byId[String(account.external_account_id)];
    if (!item) { notFound.push(account.external_account_id); return; }
    if (item.reward_point === null || item.reward_point === undefined) return;
    if (stored[String(account.project_account_id)] === Number(item.reward_point)) { same += 1; return; }
    items.push({ row: items.length + 1, project_id: asked.project.project_id, external_account_id: account.external_account_id, points: item.reward_point, as_of: new Date() });
  });
  const summary = items.length ? await rewardPoints.storeMany(items, 'API', actor)
    : { received: 0, updated: 0, unchanged: 0, stale: 0, unknown_accounts: 0, invalid: 0, problems: [] };
  summary.received += same;
  summary.unchanged += same;
  // A project's own push is not audited row by row; a manager's sync is recorded once.
  if (summary.updated) audit.created(actor, 'crm_reward_points_sync', String(partyPk), { project_code: asked.project.project_code, updated: summary.updated, unchanged: summary.unchanged }, PAGE);
  return Object.assign(summary, { accounts: asked.accounts.length, not_found: notFound });
}

module.exports = { linkParty, startJob, getJob, setJobState, resumeJobs, status, devicesOfParty, servicesOfParty, privilegesOfParty, syncLevels, syncPoints };
