const db = require('../../config/db');
const config = require('../../config');
const eshopApi = require('../../repositories/remote/eshop.api');
const appstoreApi = require('../../repositories/remote/appstore.api');
const phoneApi = require('../../repositories/remote/smartphoneOffline.api');
const identityProjects = require('./identityProjects');

/**
 * WHAT THE PROJECTS' OWN SYSTEMS SAY ABOUT ONE CUSTOMER, in one answer.
 *
 * The customer page's header figures, the Service summary and the Recent
 * activity list are worked out from the projects' APIs, not from the CRM's
 * tables: the e-shop's orders, the Appstore's purchases, and SMARTPHONE_OFFLINE's
 * devices and service records - each asked once, for every one of the
 * customer's linked accounts there, the same calls the Orders, Products and
 * Service tabs make. Nothing is stored.
 *
 *   spend      what was paid, per currency or purse - never added across them:
 *              USD and NTV and points are different units. Cancelled and refunded
 *              e-shop orders and failed Appstore purchases do not count.
 *   orders     e-shop orders and Appstore purchases, and the two together.
 *   devices    how many devices are registered.
 *   services   the service records; "open" is one the system has not updated
 *              since it was opened (no updated_at). The summary's figures.
 *   activity   the newest events across all of it, for the timeline.
 *
 * A system that cannot be asked is named in `failed`, and the rest still count.
 * The e-shop and the Appstore answer at most MAX_PER_ACCOUNT rows per account,
 * so a figure over that is a floor, and `capped` says so.
 */

const MAX_PER_ACCOUNT = 200;
const ACTIVITY = 40;
/* E-shop orders that were not paid in the end. */
const NOT_SPENT = ['CANCELLED', 'CANCEL_PENDING', 'REFUNDED', 'REFUND_ACCEPTED', 'REFUND_PENDING'];

async function accountsIn(partyPk, project) {
  if (!project) return [];
  return db('crm_project_account').where({ party_pk: partyPk, project_id: project.project_id }).whereNull('unlinked_at')
    .orderBy([{ column: 'is_primary', order: 'desc' }, { column: 'project_account_id' }])
    .select('project_account_id', 'external_account_id', 'external_account_pk');
}

function add(totals, unit, amount) {
  const value = Number(amount) || 0;
  if (!unit || !value) return;
  totals[unit] = Math.round(((totals[unit] || 0) + value) * 100) / 100;
}

/** Every account's rows of one system, asked side by side; a failure is noted, not thrown. */
function askEach(accounts, ask, system, summary) {
  return Promise.all(accounts.filter(function (account) { return account.external_account_pk; }).map(function (account) {
    return ask(account)
      .then(function (result) {
        if (result.total > result.rows.length) summary.capped.push({ system: system, external_account_id: account.external_account_id });
        return result.rows.map(function (row) { return Object.assign({ external_account_id: account.external_account_id }, row); });
      })
      .catch(function (error) {
        summary.failed.push({ system: system, external_account_id: account.external_account_id, error: error.message });
        return [];
      });
  })).then(function (lists) { return [].concat.apply([], lists); });
}

async function summary(partyPk) {
  const out = {
    spend: { currencies: {}, other: {} },
    orders: { eshop: 0, appstore: 0, total: 0 },
    devices: { total: 0 },
    services: { total: 0, open: 0, points: 0, last_at: null, monthly: [], reasons: [], agents: 0 },
    activity: [],
    failed: [],
    capped: []
  };

  const eshopProject = await identityProjects.byRole('ESHOP');
  const appstoreProject = await db('crm_project').where('project_code', 'APPSTORE').first('project_id');
  const phoneProject = await db('crm_project').where('project_code', config.smartphoneOffline.projectCode).first('project_id');
  const [eshopAccounts, appstoreAccounts, phoneAccounts, currencies] = await Promise.all([
    accountsIn(partyPk, eshopProject), accountsIn(partyPk, appstoreProject), accountsIn(partyPk, phoneProject),
    db('crm_currency').select('currency_code', 'currency_name')
  ]);
  /* A tender or purse named FOREIGN / NATIVE is shown by the CRM's own code for the currency of that name. */
  const codeOf = function (name) {
    const found = currencies.filter(function (row) { return String(row.currency_name || '').toUpperCase() === name; })[0];
    return found ? found.currency_code : null;
  };

  const masterIds = phoneAccounts.map(function (account) { return account.external_account_id; });
  const [orders, purchases, devices, services] = await Promise.all([
    askEach(eshopAccounts, function (account) { return eshopApi.orders(account.external_account_pk, 0, MAX_PER_ACCOUNT); }, 'ESHOP', out),
    askEach(appstoreAccounts, function (account) { return appstoreApi.purchases(account.external_account_pk, 0, MAX_PER_ACCOUNT, {}); }, 'APPSTORE', out),
    masterIds.length ? phoneApi.devices(masterIds).then(function (found) { return found.items; })
      .catch(function (error) { out.failed.push({ system: 'SMARTPHONE_OFFLINE', error: error.message }); return []; }) : [],
    masterIds.length ? phoneApi.services(masterIds).then(function (found) { return found.items; })
      .catch(function (error) { out.failed.push({ system: 'SMARTPHONE_OFFLINE', error: error.message }); return []; }) : []
  ]);

  /* ---- e-shop orders: spend per tender, the order count, the timeline ---- */
  orders.forEach(function (order) {
    if (NOT_SPENT.indexOf(order.status) === -1) {
      (order.tenders || []).forEach(function (tender) {
        if (tender.kind === 'POINT') add(out.spend.other, 'POINT', tender.price);
        else add(out.spend.currencies, codeOf(tender.kind) || tender.kind, tender.price);
      });
    }
    out.activity.push({
      kind: 'TRANSACTION', id: 'eshop:' + order.order_id, at: order.at, system: 'ESHOP', status: order.status,
      title: order.order_no, account: order.external_account_id, goods_count: order.goods_count || 0,
      tenders: (order.tenders || []).map(function (tender) { return { unit: tender.kind === 'POINT' ? 'POINT' : (codeOf(tender.kind) || tender.kind), price: tender.price }; })
    });
  });
  out.orders.eshop = orders.length;

  /* ---- Appstore purchases: spend per purse, the count, the timeline ---- */
  purchases.forEach(function (purchase) {
    if (purchase.status) {
      const code = purchase.currency === 'FOREIGN' ? codeOf('FOREIGN') : null;
      if (code) add(out.spend.currencies, code, purchase.price);
      else add(out.spend.other, purchase.currency || 'COMPANY', purchase.price);
    }
    out.activity.push({
      kind: 'PURCHASE', id: 'appstore:' + purchase.id, at: purchase.at, system: 'APPSTORE', status: purchase.status,
      title: purchase.name, purchase_kind: purchase.kind, account: purchase.external_account_id,
      price: purchase.price, unit: purchase.currency === 'FOREIGN' ? (codeOf('FOREIGN') || 'FOREIGN') : (purchase.currency || 'COMPANY')
    });
  });
  out.orders.appstore = purchases.length;
  out.orders.total = out.orders.eshop + out.orders.appstore;

  /* ---- SMARTPHONE_OFFLINE devices ---- */
  out.devices.total = devices.length;
  devices.forEach(function (device) {
    out.activity.push({
      kind: 'REGISTRATION', id: 'device:' + device.master_id + ':' + (device.imei || device.device), at: dateOf(device.created_at),
      system: 'SMARTPHONE_OFFLINE', title: device.device, account: device.master_id, imei: device.imei, color: device.color
    });
  });

  /* ---- SMARTPHONE_OFFLINE service records: the Service summary ---- */
  const byMonth = {};
  const reasons = {};
  const agents = {};
  services.forEach(function (service) {
    const opened = dateOf(service.created_at);
    if (!service.updated_at) out.services.open += 1;
    out.services.points += Number(service.point) || 0;
    if (opened && (!out.services.last_at || opened > out.services.last_at)) out.services.last_at = opened;
    if (opened) byMonth[opened.slice(0, 7)] = (byMonth[opened.slice(0, 7)] || 0) + 1;
    if (service.reason_type_name) reasons[service.reason_type_name] = (reasons[service.reason_type_name] || 0) + 1;
    if (service.agent_name) agents[service.agent_name] = true;
    out.activity.push({
      kind: 'CASE', id: 'service:' + service.master_id + ':' + service.created_at + ':' + (service.imei_1 || ''), at: opened,
      system: 'SMARTPHONE_OFFLINE', title: service.reason_name, account: service.master_id, open: !service.updated_at,
      model: service.model_name, agent: service.agent_name, reason: service.reason_type_name
    });
  });
  out.services.total = services.length;
  out.services.agents = Object.keys(agents).length;
  out.services.reasons = Object.keys(reasons).map(function (name) { return { name: name, count: reasons[name] }; })
    .sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
  out.services.monthly = lastMonths(12).map(function (month) { return { month: month, visits: byMonth[month] || 0 }; });
  out.services.recent = out.activity.filter(function (item) { return item.kind === 'CASE'; })
    .sort(newestFirst).slice(0, 5);

  out.activity = out.activity.filter(function (item) { return item.at; }).sort(newestFirst).slice(0, ACTIVITY);
  return out;
}

/* "2025.10.20", "2025-10-20 09:03:00" or an ISO time, as "YYYY-MM-DD HH:MM:SS"; null when there is none. */
function dateOf(value) {
  if (!value) return null;
  const text = String(value).trim().replace(/\./g, '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (!match) return null;
  const pad = function (n) { return String(n || 0).padStart(2, '0'); };
  return match[1] + '-' + pad(match[2]) + '-' + pad(match[3]) + ' ' + pad(match[4]) + ':' + pad(match[5]) + ':' + pad(match[6]);
}

function newestFirst(a, b) { return String(b.at || '').localeCompare(String(a.at || '')); }

/** The last n months as "YYYY-MM", oldest first. */
function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const at = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(at.getFullYear() + '-' + String(at.getMonth() + 1).padStart(2, '0'));
  }
  return out;
}

module.exports = { summary, MAX_PER_ACCOUNT };
