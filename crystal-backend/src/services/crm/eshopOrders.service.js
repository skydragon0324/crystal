const db = require('../../config/db');
const eshopApi = require('../../repositories/remote/eshop.api');
const identityProjects = require('./identityProjects');
const { HttpError } = require('../../utils/response');

/**
 * A CUSTOMER'S E-SHOP ORDERS, READ FROM THE E-SHOP ITSELF.
 *
 * The CRM does not keep these: the Orders tab asks the e-shop (the project
 * given the ESHOP role in Settings > Projects) for the orders of the
 * customer's linked e-shop accounts, by each account's PK - the eshop_pk the
 * shop's order API is keyed by - the same API the member's own Orders page
 * on the website calls.
 *
 * The shop answers for one account at a time. So:
 *   one account   its page, as the shop pages it;
 *   ALL accounts  the latest MAX_PER_ACCOUNT orders of each, merged newest
 *                 first and paged here; `capped` says when an account has more.
 *
 * An account the shop cannot be asked about (no PK) is listed but not asked;
 * one whose call fails is reported in `failed`, and the rest still show.
 */

const MAX_PER_ACCOUNT = 200;

/** The customer's live e-shop accounts, primary first. */
async function accountsOf(partyPk) {
  const project = await identityProjects.byRole('ESHOP');
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
 * The orders: of one account (`project_account_id`), or of every account
 * (`project_account_id` = 'ALL'). With neither, the primary account's.
 */
async function list(partyPk, filters, paging) {
  const found = await accountsOf(partyPk);
  const base = { project: found.project ? { project_id: found.project.project_id, project_code: found.project.project_code, project_name: found.project.project_name } : null,
    accounts: found.accounts, failed: [], capped: [] };
  if (!found.accounts.length) return { rows: [], total: 0, summary: base };

  const wanted = String((filters || {}).project_account_id || '');
  const all = wanted === 'ALL';
  const chosen = all ? found.accounts
    : found.accounts.filter(function (account) { return String(account.project_account_id) === wanted; }).slice(0, 1);
  const accounts = chosen.length ? chosen : found.accounts.slice(0, 1);
  const summary = Object.assign(base, { selected: all ? 'ALL' : String(accounts[0].project_account_id) });

  if (!all) {
    const account = accounts[0];
    if (!account.external_account_pk) return { rows: [], total: 0, summary: Object.assign(summary, { no_pk: [account.external_account_id] }) };
    try {
      const result = await eshopApi.orders(account.external_account_pk, paging.offset, paging.limit);
      return { rows: tagged(result.rows, account), total: result.total, summary: summary };
    } catch (error) {
      summary.failed.push({ external_account_id: account.external_account_id, error: error.message });
      return { rows: [], total: 0, summary: summary };
    }
  }

  const askable = accounts.filter(function (account) { return account.external_account_pk; });
  summary.no_pk = accounts.filter(function (account) { return !account.external_account_pk; }).map(function (account) { return account.external_account_id; });
  const results = await Promise.all(askable.map(function (account) {
    return eshopApi.orders(account.external_account_pk, 0, MAX_PER_ACCOUNT)
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

/**
 * One order's lines. The shop's detail call takes an order id alone, so the
 * order is first found in that account's own list - an id that is not one of
 * this customer's orders is not looked up.
 */
async function detail(partyPk, projectAccountId, orderId) {
  const found = await accountsOf(partyPk);
  const account = found.accounts.filter(function (row) { return String(row.project_account_id) === String(projectAccountId); })[0];
  if (!account || !account.external_account_pk) throw new HttpError(404, 'common.notFound');
  const mine = await eshopApi.orders(account.external_account_pk, 0, MAX_PER_ACCOUNT);
  const order = mine.rows.filter(function (row) { return String(row.order_id) === String(orderId); })[0];
  if (!order) throw new HttpError(404, 'common.notFound');
  const lines = await eshopApi.orderDetail(order.order_id);
  return { order: tagged([order], account)[0], lines: lines.rows };
}

module.exports = { list, detail, MAX_PER_ACCOUNT };
