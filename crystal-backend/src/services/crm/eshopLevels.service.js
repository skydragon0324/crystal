const db = require('../../config/db');
const eshopApi = require('../../repositories/remote/eshop.api');
const identityProjects = require('./identityProjects');
const memberships = require('./memberships.service');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/**
 * A CUSTOMER'S E-SHOP LEVEL AND GRADE, SYNCED FROM THE E-SHOP.
 *
 * The e-shop (the project with the ESHOP role in Settings > Projects) ranks
 * each of its accounts twice and says so for a set of account PKs in one
 * request (eshop.api levelsByIds):
 *
 *   loyal_level   -> LEVEL   the level tier whose Code in the project is it
 *   loyal_grade   -> GRADE   the grade tier whose Code in the project is it
 *   updated_at    when the shop changed them - the date the CRM's tier history
 *                 gives the step, and a new membership's joined date
 *
 * The Accounts tab's Sync levels / grades asks it for the customer's linked
 * e-shop accounts. Nothing is guessed: a value no tier has the code of is
 * reported, and the tier is set up in Settings > Project tiers.
 */

const PAGE = '/admin/crm/customers';
const SYNC_REASON = 'Synced from the e-shop';
const RANKS = [{ kind: 'LEVEL', field: 'level' }, { kind: 'GRADE', field: 'grade' }];

async function syncLevels(partyPk, actor) {
  const project = await identityProjects.byRole('ESHOP');
  if (!project) throw new HttpError(409, 'crm.eshopLevels.noEshopProject');
  const accounts = await db('crm_project_account').where({ party_pk: partyPk, project_id: project.project_id }).whereNull('unlinked_at')
    .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'project_account_id' }])
    .select('project_account_id', 'external_account_id', 'external_account_pk');
  if (!accounts.length) throw new HttpError(409, 'crm.eshopLevels.noAccounts');

  const askable = accounts.filter(function (account) { return account.external_account_pk; });
  const summary = {
    accounts: accounts.length, created: 0, changed: 0, unchanged: 0, not_found: [], unknown: [],
    no_pk: accounts.filter(function (account) { return !account.external_account_pk; }).map(function (account) { return account.external_account_id; })
  };
  if (!askable.length) return summary;

  let found;
  try {
    found = await eshopApi.levelsByIds(askable.map(function (account) { return account.external_account_pk; }));
  } catch (error) {
    throw new HttpError(502, 'crm.eshopLevels.couldNotAsk', null, { error: error.message });
  }
  /* The shop names an account by its PK - the one it was asked by - or by its Account ID. */
  const itemOf = function (account) {
    return found.items.filter(function (item) {
      return item.account_id === String(account.external_account_pk) || item.account_id === String(account.external_account_id);
    })[0] || null;
  };
  const tiers = await db('crm_project_tier').where({ project_id: project.project_id, is_active: true })
    .whereIn('tier_kind', RANKS.map(function (rank) { return rank.kind; }));

  for (let index = 0; index < askable.length; index += 1) {
    const account = askable[index];
    const item = itemOf(account);
    if (!item) { summary.not_found.push(account.external_account_id); continue; }
    for (let step = 0; step < RANKS.length; step += 1) {
      const rank = RANKS[step];
      const value = item[rank.field];
      if (value === null || value === undefined) continue;
      const tier = memberships.tierByCode(tiers, rank.kind, value);
      if (!tier) { summary.unknown.push({ external_account_id: account.external_account_id, tier_kind: rank.kind, by: 'CODE', value: value }); continue; }
      // eslint-disable-next-line no-await-in-loop
      const result = await transaction(function (trx) { return memberships.placeOn(trx, account.project_account_id, tier, SYNC_REASON, item.updated_at); });
      summary[result.status.toLowerCase()] += 1;
      if (result.status === 'CREATED') audit.created(actor, 'crm_membership', result.after.membership_id, result.after, PAGE);
      if (result.status === 'CHANGED') audit.updated(actor, 'crm_membership', result.after.membership_id, result.before, result.after, PAGE);
    }
  }
  return summary;
}

module.exports = { syncLevels };
