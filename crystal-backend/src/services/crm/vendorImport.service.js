const defaultDb = require('../../config/db');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const legacyIdentity = require('../../repositories/legacy/identity.repository');
const eshopApi = require('../../repositories/remote/eshop.api');
const appstoreApi = require('../../repositories/remote/appstore.api');
const identity = require('./identity.service');
const transactions = require('./transactions.service');

/**
 * THE ESHOP AND THE APPSTORE INTO THE CRM - two more projects' adapters.
 *
 * Both are separate systems Crystal reaches over HTTP (src/config/remote.js;
 * in development the same calls are answered by an in-process mock in each
 * service's own wire format). Which Eshop and Appstore account belongs to a
 * member is the VENDOR PLATFORM's answer - its merge table, read by
 * repositories/legacy/identity.repository.js exactly as the storefront does -
 * so those accounts are linked to the member's party with method PLATFORM,
 * through the same identity resolution every adapter uses.
 *
 * What each brings:
 *
 *   ESHOP     the account; the membership with its card level as the tier
 *             (tier changes appended to the tier history); every order as a
 *             SALE, with its lines and the goods as Eshop catalogue products;
 *             a refunded order also as a REFUND row pointing at the sale.
 *
 *   APPSTORE  the account; every purchase as an APP_PURCHASE; a purchased app
 *             also as an entitlement the member holds (a LICENSEE
 *             registration), so apps sit beside phones and televisions in the
 *             customer's products.
 *
 * MONEY. The Eshop sells in foreign currency, native currency and points; the
 * Appstore in foreign currency, company coins and diamonds. Points and
 * diamonds go to points_used and are never money. Native currency and coins
 * are converted for Dream-wide figures at the rate in system settings
 * (company.native_currency_rate): an order paid only in them keeps its own
 * currency with a converted reporting amount; one that also took foreign
 * currency is recorded in the reporting currency.
 *
 * Read-only on both services. A member whose service does not answer is
 * counted and skipped; the rest carry on.
 */

const ORDER_PAGE = 200;

function money(value) { return Math.round((Number(value) || 0) * 100) / 100; }

async function context(connection) {
  const [projects, tiers, rate, reporting] = await Promise.all([
    vocabulary.mapOf('crm_project', connection),
    connection('crm_project_tier as t').join('crm_project as p', 'p.project_id', 't.project_id')
      .where('p.project_code', 'ESHOP').select('t.project_tier_id', 't.source_code'),
    connection('system_settings').where('setting_key', 'company.native_currency_rate').first('setting_val'),
    connection('crm_currency').where('is_reporting', true).first('currency_code')
  ]);
  const tierBySource = {};
  tiers.forEach(function (t) { tierBySource[t.source_code] = t.project_tier_id; });
  return {
    project: projects,
    tierBySource: tierBySource,
    rate: rate ? Number(rate.setting_val) || 0 : 0,
    reporting: reporting ? reporting.currency_code : 'USD',
    relationship: await vocabulary.mapOf('crm_product_relationship_type', connection),
    acquisition: await vocabulary.mapOf('crm_acquisition_type', connection)
  };
}

/** A catalogue product of a project, created the first time it is sold. */
async function productFor(trx, projectId, code, name, kind) {
  await trx.raw(`
    INSERT INTO crm_product_catalog (project_id, product_code, product_name, product_kind)
    VALUES (?, ?, ?, ?) ON CONFLICT (project_id, product_code) DO NOTHING`,
  [projectId, String(code).slice(0, 100), String(name || code).slice(0, 250), kind]);
  const row = await trx('crm_product_catalog').where({ project_id: projectId, product_code: String(code).slice(0, 100) }).first('product_id');
  return row.product_id;
}

/** Foreign + native (+ points) as one amount, by the rule in the header. */
function amountOf(foreign, native, ctx) {
  const foreignAmount = money(foreign);
  const nativeAmount = money(native);
  if (foreignAmount > 0) return { currency_code: ctx.reporting, net_amount: money(foreignAmount + nativeAmount * ctx.rate), reporting_net_amount: money(foreignAmount + nativeAmount * ctx.rate) };
  if (nativeAmount > 0) return { currency_code: 'NTV', net_amount: nativeAmount, reporting_net_amount: ctx.rate ? money(nativeAmount * ctx.rate) : null };
  return { currency_code: ctx.reporting, net_amount: 0, reporting_net_amount: 0 };
}

/* ------------------------------------------------------------ the Eshop */

async function eshopMember(connection, ctx, member, keys, result) {
  const card = await eshopApi.cardInfo(keys.eshop_pk);
  const orders = await eshopApi.orders(keys.eshop_pk, 0, ORDER_PAGE);
  const details = {};
  for (let index = 0; index < orders.rows.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    details[orders.rows[index].order_id] = (await eshopApi.orderDetail(orders.rows[index].order_id)).rows;
  }

  await connection.transaction(async function (trx) {
    const resolved = await identity.resolveAccount(trx, {
      project_id: ctx.project.ESHOP,
      external_account_id: keys.eshop_pk,
      external_login: keys.eshop_id,
      external_account_type: 'ESHOP_CUSTOMER',
      known_party_id: member.party_id
    });
    if (resolved.outcome !== 'EXISTING') result.accounts += 1;

    /* the membership, and the card level as its tier */
    if (card) {
      const tierId = ctx.tierBySource[String(card.card_level)] || null;
      const current = await trx('crm_membership').where({ party_id: member.party_id, project_id: ctx.project.ESHOP }).first();
      const values = {
        external_member_id: card.vip_no || card.customer_no || String(keys.eshop_pk),
        current_tier_id: tierId,
        tier_value: card.accum_value,
        available_reward_points: card.prize_value,
        membership_status: 'ACTIVE',
        source_payload: JSON.stringify(card),
        synced_at: trx.fn.now()
      };
      if (current) {
        await trx('crm_membership').where('membership_id', current.membership_id).update(values);
        if (tierId && String(current.current_tier_id) !== String(tierId)) {
          await trx('crm_membership_tier_history').insert({
            membership_id: current.membership_id, old_tier_id: current.current_tier_id, new_tier_id: tierId,
            change_reason: 'Eshop card level reported as ' + card.card_level
          });
          result.tier_changes += 1;
        }
      } else {
        const rows = await trx('crm_membership').insert(Object.assign({
          party_id: member.party_id, project_id: ctx.project.ESHOP, joined_at: member.first_seen_at
        }, values)).returning('membership_id');
        const membershipId = typeof rows[0] === 'object' ? rows[0].membership_id : rows[0];
        if (tierId) {
          await trx('crm_membership_tier_history').insert({
            membership_id: membershipId, old_tier_id: null, new_tier_id: tierId, change_reason: 'First seen by the CRM'
          });
        }
        result.memberships += 1;
      }
    }

    /* the orders */
    for (let index = 0; index < orders.rows.length; index += 1) {
      const order = orders.rows[index];
      const tender = { FOREIGN: 0, NATIVE: 0, POINT: 0 };
      (order.tenders || []).forEach(function (t) { tender[t.kind] = (tender[t.kind] || 0) + t.price; });
      const amount = amountOf(tender.FOREIGN, tender.NATIVE, ctx);

      const lines = details[order.order_id] || [];
      const items = [];
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        // eslint-disable-next-line no-await-in-loop
        const productId = line.goods_id ? await productFor(trx, ctx.project.ESHOP, 'goods:' + line.goods_id, line.goods_name, 'GOODS') : null;
        items.push({
          product_id: productId, external_item_id: order.order_id + ':' + lineIndex, quantity: line.qty,
          unit_price: line.real_price, gross_amount: money(line.price * line.qty), net_amount: line.total_price,
          discount_amount: money(line.price * line.qty - line.total_price)
        });
      }

      // eslint-disable-next-line no-await-in-loop
      const sale = await transactions.upsert(trx, Object.assign({
        project_id: ctx.project.ESHOP,
        external_transaction_id: order.order_id,
        transaction_type_code: 'SALE',
        transaction_status: order.status || 'PENDING',
        points_used: tender.POINT || null,
        sales_channel_code: 'ESHOP',
        transaction_at: order.at,
        parties: [{ party_id: member.party_id, party_role_code: 'BUYER' }],
        items: items
      }, amount), ctx.reporting);
      if (sale.created) result.transactions += 1;

      if (order.status === 'REFUNDED' && amount.net_amount > 0) {
        // eslint-disable-next-line no-await-in-loop
        const refund = await transactions.upsert(trx, {
          project_id: ctx.project.ESHOP,
          external_transaction_id: order.order_id + ':refund',
          original_transaction_id: sale.transaction_id,
          transaction_type_code: 'REFUND',
          transaction_status: 'REFUNDED',
          currency_code: amount.currency_code,
          net_amount: -amount.net_amount,
          reporting_net_amount: amount.reporting_net_amount === null ? null : -amount.reporting_net_amount,
          sales_channel_code: 'ESHOP',
          transaction_at: order.at,
          parties: [{ party_id: member.party_id, party_role_code: 'BUYER' }]
        }, ctx.reporting);
        if (refund.created) result.transactions += 1;
      }
    }
  });
}

/* ------------------------------------------------------------ the Appstore */

const PURCHASE_STATUS = { PURCHASED: 'COMPLETED', PURCHASING: 'PENDING' };

async function appstoreMember(connection, ctx, member, keys, result) {
  const purchases = await appstoreApi.purchases(keys.appstore_customer_id, 0, ORDER_PAGE, {});

  await connection.transaction(async function (trx) {
    const resolved = await identity.resolveAccount(trx, {
      project_id: ctx.project.APPSTORE,
      external_account_id: keys.appstore_customer_id,
      external_account_type: 'APPSTORE_CUSTOMER',
      known_party_id: member.party_id
    });
    if (resolved.outcome !== 'EXISTING') result.accounts += 1;

    for (let index = 0; index < (purchases.rows || []).length; index += 1) {
      const purchase = purchases.rows[index];
      const kind = purchase.kind === 'APP' ? 'SOFTWARE' : 'GOODS';
      // eslint-disable-next-line no-await-in-loop
      const productId = await productFor(trx, ctx.project.APPSTORE, String(purchase.kind) + ':' + (purchase.name || purchase.id), purchase.name, kind);

      const paid = purchase.currency === 'FOREIGN' ? amountOf(purchase.price, 0, ctx)
        : (purchase.currency === 'COMPANY' ? amountOf(0, purchase.price, ctx) : amountOf(0, 0, ctx));
      const status = PURCHASE_STATUS[purchase.status] || 'FAILED';

      /* An app bought is an app held - an entitlement, beside the member's devices. */
      let instanceId = null;
      if (purchase.kind === 'APP' && status === 'COMPLETED') {
        const external = 'purchase:' + purchase.id;
        // eslint-disable-next-line no-await-in-loop
        await trx.raw(`
          INSERT INTO crm_product_instance (product_id, project_id, external_product_instance_id, instance_kind, activated_at, status)
          VALUES (?, ?, ?, 'ENTITLEMENT', ?, ?) ON CONFLICT (project_id, external_product_instance_id) DO NOTHING`,
        [productId, ctx.project.APPSTORE, external, purchase.at, purchase.licence_state === 'REFUND' ? 'VOID' : 'ACTIVE']);
        // eslint-disable-next-line no-await-in-loop
        const instance = await trx('crm_product_instance').where({ project_id: ctx.project.APPSTORE, external_product_instance_id: external }).first();
        instanceId = instance.product_instance_id;
        // eslint-disable-next-line no-await-in-loop
        const held = await trx('crm_product_registration').where({ project_id: ctx.project.APPSTORE, source_record_id: 'appstore:' + purchase.id }).first('product_registration_id');
        if (!held && purchase.licence_state !== 'REFUND') {
          // eslint-disable-next-line no-await-in-loop
          await trx('crm_product_registration').insert({
            party_id: member.party_id, product_instance_id: instanceId,
            relationship_type_id: ctx.relationship.LICENSEE, relationship_code: 'LICENSEE',
            project_id: ctx.project.APPSTORE, registration_channel: 'APP',
            acquisition_type_id: ctx.acquisition.PURCHASED || null,
            registration_status: 'ACTIVE', registered_at: purchase.at, valid_from: purchase.at,
            source_record_id: 'appstore:' + purchase.id
          });
          result.entitlements += 1;
        }
      }

      // eslint-disable-next-line no-await-in-loop
      const sale = await transactions.upsert(trx, Object.assign({
        project_id: ctx.project.APPSTORE,
        external_transaction_id: String(purchase.id),
        transaction_type_code: 'APP_PURCHASE',
        transaction_status: status,
        points_used: purchase.currency === 'IMMATERIAL' ? purchase.price : null,
        sales_channel_code: 'APPSTORE',
        transaction_at: purchase.at,
        parties: [{ party_id: member.party_id, party_role_code: 'BUYER' }],
        items: [{ product_id: productId, product_instance_id: instanceId, external_item_id: purchase.id, quantity: 1, net_amount: paid.net_amount }]
      }, paid), ctx.reporting);
      if (sale.created) result.transactions += 1;

      if (purchase.licence_state === 'REFUND' && paid.net_amount > 0) {
        // eslint-disable-next-line no-await-in-loop
        await transactions.upsert(trx, {
          project_id: ctx.project.APPSTORE,
          external_transaction_id: purchase.id + ':refund',
          original_transaction_id: sale.transaction_id,
          transaction_type_code: 'REFUND',
          transaction_status: 'REFUNDED',
          currency_code: paid.currency_code,
          net_amount: -paid.net_amount,
          reporting_net_amount: paid.reporting_net_amount === null ? null : -paid.reporting_net_amount,
          sales_channel_code: 'APPSTORE',
          transaction_at: purchase.at,
          parties: [{ party_id: member.party_id, party_role_code: 'BUYER' }]
        }, ctx.reporting);
      }
    }
  });
}

/* ------------------------------------------------------------ the run */

/**
 * Every Crystal member the CRM already knows, asked about their Eshop and
 * Appstore accounts. Run after the Crystal import, which is what makes them
 * known; members are matched to the vendor accounts by the platform, never by
 * guessing.
 */
async function run(options) {
  const connection = (options && options.db) || defaultDb;
  const ctx = await context(connection);
  if (!ctx.project.ESHOP || !ctx.project.APPSTORE) throw new Error('the ESHOP or APPSTORE project is missing from crm_project');

  const members = await connection('crm_project_account as a').join('crm_party as p', 'p.party_id', 'a.party_id')
    .join('users as u', 'u.id', 'a.crystal_user_id')
    .where('a.project_id', ctx.project.CRYSTAL).whereNull('a.unlinked_at').whereIn('p.party_status', ['ACTIVE', 'INACTIVE'])
    .select('a.party_id', 'a.crystal_user_id', 'p.first_seen_at', 'u.login', 'u.email');

  const result = { members: members.length, accounts: 0, memberships: 0, tier_changes: 0, transactions: 0, entitlements: 0, unavailable: 0, not_on_platform: 0 };

  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    let keys;
    try {
      // eslint-disable-next-line no-await-in-loop
      keys = await legacyIdentity.keysOf(member.crystal_user_id, member.login || String(member.email || '').split('@')[0]);
    } catch (err) {
      result.unavailable += 1;
      continue;
    }
    if (!keys.eshop_pk && !keys.appstore_customer_id) { result.not_on_platform += 1; continue; }

    try {
      // eslint-disable-next-line no-await-in-loop
      if (keys.eshop_pk) await eshopMember(connection, ctx, member, keys, result);
      // eslint-disable-next-line no-await-in-loop
      if (keys.appstore_customer_id) await appstoreMember(connection, ctx, member, keys, result);
    } catch (err) {
      console.warn('[crm] vendor import for party ' + member.party_id + ' failed - ' + err.message);
      result.unavailable += 1;
    }
  }

  return result;
}

module.exports = { run: run };
