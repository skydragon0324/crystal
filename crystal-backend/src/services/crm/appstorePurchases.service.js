const db = require('../../config/db');
const appstoreApi = require('../../repositories/remote/appstore.api');
const audit = require('../audit.service');
const { HttpError } = require('../../utils/response');

/**
 * A CUSTOMER'S APPSTORE PURCHASES, READ FROM THE APPSTORE ITSELF.
 *
 * Like the e-shop orders (eshopOrders.service.js): the CRM keeps none of
 * this. The Appstore project (code APPSTORE) is asked, by the PK of each of
 * the customer's linked Appstore accounts - the appstore_pk its purchase API
 * calls customer_id - the same API the member's own Purchases page calls.
 *
 * One account at a time, as the store answers; ALL asks each and merges the
 * latest MAX_PER_ACCOUNT of each, newest first. An account with no PK cannot
 * be asked and is reported, as is one the store could not answer for.
 *
 * The licence key is the most sensitive thing here: it is fetched only on
 * request, only for a purchase found in that account's own list (the store's
 * call takes a purchase id and no customer), and every look is audited.
 */

const PROJECT_CODE = 'APPSTORE';
const MAX_PER_ACCOUNT = 200;
const PAGE = '/admin/crm/customers';

async function accountsOf(partyPk) {
  const project = await db('crm_project').where('project_code', PROJECT_CODE).first('project_id', 'project_code', 'project_name');
  if (!project) return { project: null, accounts: [] };
  const accounts = await db('crm_project_account')
    .where({ party_pk: partyPk, project_id: project.project_id }).whereNull('unlinked_at')
    .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'project_account_id' }])
    .select('project_account_id', 'external_account_id', 'external_account_pk', 'is_primary');
  return { project: project, accounts: accounts };
}

function tagged(rows, account) {
  return rows.map(function (row) {
    return Object.assign({}, row, {
      project_account_id: account.project_account_id,
      external_account_id: account.external_account_id,
      external_account_pk: account.external_account_pk
    });
  });
}

/**
 * The store's own filters: a date window (YYYY-MM-DD) and a search word. The
 * word as the website's Purchases page sends it (storefronts.controller
 * searchTerm): the store matches it as written, so runs of spaces are one.
 */
function filterOf(filters) {
  const date = function (value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : ''; };
  return { from: date(filters.from), to: date(filters.to), keyword: String(filters.q || '').replace(/\s+/g, ' ').trim().slice(0, 100) };
}

async function list(partyPk, filters, paging) {
  const found = await accountsOf(partyPk);
  const summary = { project: found.project, accounts: found.accounts, failed: [], capped: [], no_pk: [] };
  if (!found.accounts.length) return { rows: [], total: 0, summary: summary };

  const wanted = String((filters || {}).project_account_id || '');
  const all = wanted === 'ALL';
  const chosen = all ? found.accounts
    : found.accounts.filter(function (account) { return String(account.project_account_id) === wanted; }).slice(0, 1);
  const accounts = chosen.length ? chosen : found.accounts.slice(0, 1);
  summary.selected = all ? 'ALL' : String(accounts[0].project_account_id);
  const filter = filterOf(filters || {});

  summary.no_pk = accounts.filter(function (account) { return !account.external_account_pk; }).map(function (account) { return account.external_account_id; });
  const askable = accounts.filter(function (account) { return account.external_account_pk; });

  if (!all) {
    if (!askable.length) return { rows: [], total: 0, summary: summary };
    try {
      const result = await appstoreApi.purchases(askable[0].external_account_pk, paging.offset, paging.limit, filter);
      return { rows: tagged(result.rows, askable[0]), total: result.total, summary: summary };
    } catch (error) {
      summary.failed.push({ external_account_id: askable[0].external_account_id, error: error.message });
      return { rows: [], total: 0, summary: summary };
    }
  }

  const results = await Promise.all(askable.map(function (account) {
    return appstoreApi.purchases(account.external_account_pk, 0, MAX_PER_ACCOUNT, filter)
      .then(function (result) {
        if (result.total > result.rows.length) summary.capped.push({ external_account_id: account.external_account_id, total: result.total, shown: result.rows.length });
        return tagged(result.rows, account);
      })
      .catch(function (error) {
        summary.failed.push({ external_account_id: account.external_account_id, error: error.message });
        return [];
      });
  }));
  const merged = [].concat.apply([], results).sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
  return { rows: merged.slice(paging.offset, paging.offset + paging.limit), total: merged.length, summary: summary };
}

/** One purchase's licence: only for a purchase in that account's own list; the look is audited. */
async function licence(partyPk, projectAccountId, purchaseId, actor) {
  const found = await accountsOf(partyPk);
  const account = found.accounts.filter(function (row) { return String(row.project_account_id) === String(projectAccountId); })[0];
  if (!account || !account.external_account_pk) throw new HttpError(404, 'common.notFound');
  const mine = await appstoreApi.purchases(account.external_account_pk, 0, MAX_PER_ACCOUNT, {});
  const purchase = mine.rows.filter(function (row) { return String(row.id) === String(purchaseId); })[0];
  if (!purchase) throw new HttpError(404, 'common.notFound');
  const held = await appstoreApi.license(purchase.id);
  if (!held) throw new HttpError(404, 'common.notFound');
  audit.created(actor, 'appstore_licence_view', String(purchase.id),
    { party_pk: String(partyPk), external_account_id: account.external_account_id, purchase_id: String(purchase.id), name: purchase.name }, PAGE);
  return Object.assign({ purchase: tagged([purchase], account)[0] }, held);
}

module.exports = { list, licence, MAX_PER_ACCOUNT, PROJECT_CODE };
