const crypto = require('crypto');
const db = require('../../config/db');
const config = require('../../config');
const remote = require('../../repositories/remote/smartphoneOffline.api');
const audit = require('../audit.service');
const memberships = require('./memberships.service');
const rewardPoints = require('./rewardPoints.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

const PAGE = '/admin/crm/customers';
/* One run links at most this many customers; a larger range is split by the manager. */
const MAX_RUN = 1000;
/* Lookups in flight at once during a run. */
const CONCURRENCY = 5;
/* Conflicts and failures a run keeps to show; the counts are always complete. */
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

/** Every phone of one customer, asked and linked. Adds to `summary`. */
async function linkOne(party, projectId, summary, actor) {
  summary.customers += 1;
  const phones = await phonesOf(party.party_pk);
  for (let index = 0; index < phones.length; index += 1) {
    const phone = phones[index];
    summary.phones += 1;
    // eslint-disable-next-line no-await-in-loop
    const known = await db('crm_project_account').where({ project_id: projectId, party_pk: party.party_pk, matched_phone: phone }).whereNull('unlinked_at').first('project_account_id');
    if (known) { summary.skipped += 1; continue; }
    let users;
    try {
      // eslint-disable-next-line no-await-in-loop
      users = await remote.findByPhone(phone);
    } catch (error) {
      summary.failed_count = (summary.failed_count || 0) + 1;
      if (summary.failed.length < KEEP) summary.failed.push({ party_pk: String(party.party_pk), phone: phone, error: error.message });
      continue;
    }
    if (!users.length) { summary.not_found += 1; continue; }
    for (let user = 0; user < users.length; user += 1) {
      // eslint-disable-next-line no-await-in-loop
      await attach(party.party_pk, projectId, phone, users[user], summary, actor);
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
  await linkOne(party, target.project_id, summary, actor);
  return finished(summary);
}

/* ------------------------------------------------------------ runs over a range */

/*
 * A range of customers is linked in the background - a thousand customers
 * outlast any request - and the Customers page polls the run. Runs live in
 * this process only: one at a time, the last few kept to be read back. A
 * restart ends a run part-way; running the same range again only asks about
 * the numbers it had not reached (the rest are skipped).
 */
const runs = new Map();
let current = null;

function publicRun(run) {
  return {
    run_id: run.run_id, from_party_pk: run.from_party_pk, to_party_pk: run.to_party_pk, status: run.status,
    total: run.total, done: run.done, started_at: run.started_at, finished_at: run.finished_at, error: run.error,
    summary: finished(run.summary)
  };
}

async function startRun(body, actor) {
  const from = String((body || {}).from_party_pk || '').trim();
  const to = String((body || {}).to_party_pk || '').trim();
  if (!/^[1-9][0-9]*$/.test(from) || !/^[1-9][0-9]*$/.test(to)) throw new HttpError(400, 'crm.smartphoneOffline.chooseARange');
  if (BigInt(from) > BigInt(to)) throw new HttpError(400, 'crm.smartphoneOffline.rangeIsBackwards');
  if (current) throw new HttpError(409, 'crm.smartphoneOffline.runInProgress');
  available();
  const target = await project();

  // Customers in the range who have a phone to ask about, oldest number first.
  const parties = await db('crm_party as party').whereBetween('party.party_pk', [from, to]).whereIn('party.party_status', ['ACTIVE', 'INACTIVE'])
    .whereExists(function () {
      this.select(db.raw(1)).from('crm_contact_point as phone').whereRaw('phone.party_pk = party.party_pk')
        .whereIn('phone.contact_type', ['MOBILE', 'PHONE']).where('phone.status', 'ACTIVE');
    })
    .orderBy('party.party_pk').select('party.party_pk', 'party.party_status');
  if (!parties.length) throw new HttpError(400, 'crm.smartphoneOffline.noCustomersInRange');
  if (parties.length > MAX_RUN) throw new HttpError(400, 'crm.smartphoneOffline.rangeTooLarge', null, { max: MAX_RUN, count: parties.length });

  const run = {
    run_id: crypto.randomBytes(8).toString('hex'), from_party_pk: from, to_party_pk: to, status: 'RUNNING',
    total: parties.length, done: 0, started_at: new Date().toISOString(), finished_at: null, error: null, summary: emptySummary()
  };
  runs.set(run.run_id, run);
  if (runs.size > 20) runs.delete(runs.keys().next().value);
  current = run;

  let next = 0;
  const worker = async function () {
    while (next < parties.length && run.status === 'RUNNING') {
      const party = parties[next];
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      await linkOne(party, target.project_id, run.summary, actor);
      run.done += 1;
    }
  };
  Promise.all(Array.from({ length: Math.min(CONCURRENCY, parties.length) }, worker))
    .then(function () { run.status = 'DONE'; })
    .catch(function (error) { run.status = 'FAILED'; run.error = error.message; })
    .then(function () {
      run.finished_at = new Date().toISOString();
      current = null;
      audit.created(actor, 'crm_smartphone_offline_run', run.run_id, publicRun(run), PAGE);
    });

  return publicRun(run);
}

function getRun(id) {
  const run = runs.get(String(id || ''));
  if (!run) throw new HttpError(404, 'common.notFound');
  return publicRun(run);
}

/** What the Customers page needs before it offers a run: the project, whether the system is reachable, a run already going. */
async function status() {
  const row = await db('crm_project').where('project_code', config.smartphoneOffline.projectCode).first('project_id', 'project_name');
  return { mode: remote.mode(), project: row || null, project_code: config.smartphoneOffline.projectCode, max_run: MAX_RUN, running: current ? publicRun(current) : null };
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
    tierOf: function (tiers, value) { return tiers.filter(function (tier) { return tier.tier_kind === 'GRADE' && sameCode(value, tier.source_code); })[0] || null; } }
];

/** A level as the system sends it and a tier's code, compared as numbers when both are ("03" is 3). */
function sameCode(sent, code) {
  const a = String(sent).trim();
  const b = String(code === null || code === undefined ? '' : code).trim();
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return Number(a) === Number(b);
  return a !== '' && a.toUpperCase() === b.toUpperCase();
}

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

module.exports = { linkParty, startRun, getRun, status, devicesOfParty, servicesOfParty, privilegesOfParty, syncLevels, syncPoints, MAX_RUN };
