'use strict';

/**
 * THE DEMO CRM'S STARTING POINT - test data with invented names, never production.
 *
 *   run by seed 09_crm; scripts/demo-crm.js (seed 10) builds on what this writes
 *
 * The CRM itself knows no projects: they are rows an administrator adds in
 * Settings > Projects. This demo adds five of its own and fills them, so every
 * screen has something on it:
 *
 *   UID         the user management system - every customer's login, member points
 *   SMARTPHONE  phones: sales, registrations, repairs at the service centres
 *   EPRODUCT    TVs, boxes, PCs, cameras: the same
 *   APPSTORE    apps and licences
 *   ESHOP       the web shop: accessories, card levels as tiers
 *
 * Sales and new customers grow over the two years it covers, so the overview's
 * trends have a shape. A fixed seed makes every run write the same data.
 *
 * It runs once: a database that already has the demo's sites is left alone. Projects
 * and their settings are added only where missing, so a reseed keeps them.
 */

const db = require('../src/config/db');
const parties = require('../src/services/crm/parties.service');
const products = require('../src/services/crm/products.service');
const transactions = require('../src/services/crm/transactions.service');
const ledger = require('../src/services/crm/ledger');
const locations = require('../src/services/crm/locations');
const analysis = require('../src/services/crm/analysis.service');
const analysisRun = require('../src/services/crm/analysisRun.service');

const DAY = 86400000;

/* A fixed sequence, so two runs choose the same customers, products and dates. */
function sequence(start) {
  let state = start;
  return function next() {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
const random = sequence(20261012);
const pick = function (list) { return list[Math.floor(random() * list.length)]; };
const between = function (low, high) { return low + Math.floor(random() * (high - low + 1)); };
const daysAgo = function (days) { return new Date(Date.now() - days * DAY); };

/*
 * A day in the last `span` days, weighted towards the recent end - more
 * customers joined and more was sold lately, which is what growth looks like.
 */
function recentDay(span) {
  return daysAgo(Math.floor(span * Math.pow(random(), 1.6)));
}

const PROJECTS = [
  ['UID', 'User Management System', 'PLATFORM', 'USER_MANAGEMENT'],
  ['SMARTPHONE', 'Smartphones', 'SERVICE', null],
  ['EPRODUCT', 'Electronic products', 'SERVICE', null],
  ['APPSTORE', 'Appstore', 'SOFTWARE', null],
  ['ESHOP', 'Eshop', 'COMMERCE', 'ESHOP']
];

/* [project, code, name, class, kind, price] */
const CATALOGUE = [
  ['SMARTPHONE', 'PHONE-9-PRO', 'Dream Phone 9 Pro', 'PHONE_9', 'DEVICE', 899],
  ['SMARTPHONE', 'PHONE-9', 'Dream Phone 9', 'PHONE_9', 'DEVICE', 699],
  ['SMARTPHONE', 'PHONE-7', 'Dream Phone 7', 'PHONE_7', 'DEVICE', 449],
  ['SMARTPHONE', 'PHONE-5-LITE', 'Dream Phone 5 Lite', 'PHONE_5', 'DEVICE', 249],
  ['SMARTPHONE', 'PHONE-3', 'Dream Phone 3', 'PHONE_3', 'DEVICE', 149],
  ['EPRODUCT', 'VISION-85', 'Vision 85 QLED TV', 'TV_LARGE', 'DEVICE', 1899],
  ['EPRODUCT', 'VISION-65', 'Vision 65 QLED TV', 'TV_MEDIUM', 'DEVICE', 999],
  ['EPRODUCT', 'VISION-43', 'Vision 43 TV', 'TV_SMALL', 'DEVICE', 399],
  ['EPRODUCT', 'LINK-BOX-4K', 'Link Box 4K', 'STB', 'DEVICE', 129],
  ['EPRODUCT', 'STUDIO-14', 'Studio 14 laptop', 'NOTECOM', 'DEVICE', 1099],
  ['EPRODUCT', 'MINI-PC', 'Dream Mini PC', 'PC', 'DEVICE', 599],
  ['EPRODUCT', 'CAM-360', 'Cam 360', 'CAMERA', 'DEVICE', 199],
  ['APPSTORE', 'KARAOKE-LICENCE', 'Karaoke licence, one year', 'KARAOKE_LICENCE', 'LICENCE', 49],
  ['APPSTORE', 'MEDIA-LICENCE', 'Media licence, one year', 'MEDIA_LICENCE', 'LICENCE', 29],
  ['APPSTORE', 'FITNESS-PRO', 'Fitness Pro', 'APP', 'SOFTWARE', 9.99],
  ['APPSTORE', 'OFFICE-SUITE', 'Office Suite', 'APP', 'SOFTWARE', 19.99],
  ['APPSTORE', 'PHOTO-STUDIO', 'Photo Studio', 'APP', 'SOFTWARE', 4.99],
  ['ESHOP', 'CHARGER-30W', 'Fast charger 30W', null, 'GOODS', 25],
  ['ESHOP', 'EARBUDS', 'Wireless earbuds', null, 'GOODS', 79],
  ['ESHOP', 'CASE', 'Phone case', null, 'GOODS', 15],
  ['ESHOP', 'SCREEN-GLASS', 'Screen protector', null, 'GOODS', 9],
  ['ESHOP', 'HDMI-CABLE', 'HDMI cable 2 m', null, 'GOODS', 12]
];

const GIVEN = ['Wei', 'Fang', 'Lei', 'Min', 'Jing', 'Hao', 'Yan', 'Tao', 'Li', 'Qiang', 'Hui', 'Jun', 'Ying', 'Bo', 'Xin',
  'Ping', 'Rui', 'Lan', 'Kai', 'Mei', 'Chen', 'Yu', 'Ning', 'Feng'];
const FAMILY = ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu', 'Xu', 'Sun', 'Hu', 'Zhu', 'Gao', 'Lin'];
const CITIES = ['Shanghai', 'Beijing', 'Guangzhou', 'Shenzhen', 'Hangzhou', 'Chengdu', 'Wuhan', 'Nanjing', 'Xi\'an', 'Suzhou',
  'Tianjin', 'Chongqing', 'Qingdao', 'Xiamen', 'Changsha', 'Kunming'];

const CUSTOMERS = 90;

/* ------------------------------------------------------------------ setup */

async function addProjects() {
  const ids = {};
  for (const [code, name, type, role] of PROJECTS) {
    // eslint-disable-next-line no-await-in-loop
    await db.raw(`INSERT INTO crm_project (project_code, project_name, project_type_code, identity_role)
                  SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM crm_project WHERE project_code = ?)`,
    [code, name, type, role && !(await db('crm_project').where('identity_role', role).first()) ? role : null, code]);
    // eslint-disable-next-line no-await-in-loop
    ids[code] = (await db('crm_project').where('project_code', code).first('project_id')).project_id;
  }
  return ids;
}

/** What each project may send and when consent is needed, the Eshop's card levels, and who owns each point currency. */
async function addProjectSettings(project) {
  const option = function (code, purpose, channel, needs) { return [project[code], purpose, channel, needs]; };
  const options = [
    option('SMARTPHONE', 'TRANSACTIONAL', 'SMS', false), option('SMARTPHONE', 'SERVICE_NOTICE', 'SMS', false),
    option('SMARTPHONE', 'SERVICE_NOTICE', 'EMAIL', false), option('SMARTPHONE', 'MARKETING', 'EMAIL', true),
    option('SMARTPHONE', 'MARKETING', 'SMS', true), option('SMARTPHONE', 'SURVEY', 'EMAIL', true),
    option('EPRODUCT', 'TRANSACTIONAL', 'SMS', false), option('EPRODUCT', 'SERVICE_NOTICE', 'SMS', false),
    option('EPRODUCT', 'MARKETING', 'EMAIL', true), option('EPRODUCT', 'SURVEY', 'EMAIL', true),
    option('APPSTORE', 'TRANSACTIONAL', 'IN_APP', false), option('APPSTORE', 'MARKETING', 'PUSH', true),
    option('APPSTORE', 'MARKETING', 'IN_APP', true),
    option('ESHOP', 'TRANSACTIONAL', 'SMS', false), option('ESHOP', 'MARKETING', 'EMAIL', true),
    option('ESHOP', 'MARKETING', 'SMS', true), option('ESHOP', 'MARKETING', 'PUSH', true),
    option('UID', 'EVENT_NOTICE', 'SMS', true), option('UID', 'EVENT_NOTICE', 'IN_APP', false),
    option('UID', 'MARKETING', 'EMAIL', true), option('UID', 'MARKETING', 'SMS', true)
  ];
  for (const [projectId, purpose, channel, needs] of options) {
    // eslint-disable-next-line no-await-in-loop
    await db.raw(`INSERT INTO crm_project_communication_option (project_id, purpose_id, channel_id, consent_required)
                  SELECT ?, purpose.purpose_id, channel.channel_id, ?
                    FROM crm_communication_purpose purpose, crm_communication_channel channel
                   WHERE purpose.purpose_code = ? AND channel.channel_code = ?
                     AND NOT EXISTS (SELECT 1 FROM crm_project_communication_option seen
                                      WHERE seen.project_id = ? AND seen.purpose_id = purpose.purpose_id AND seen.channel_id = channel.channel_id)`,
    [projectId, needs, purpose, channel, projectId]);
  }

  for (let level = 1; level <= 5; level += 1) {
    // eslint-disable-next-line no-await-in-loop
    await db.raw(`INSERT INTO crm_project_tier (project_id, tier_code, tier_name, rank_no, tier_kind, source_code)
                  VALUES (?, ?, ?, ?, 'CARD_CLASS', ?) ON CONFLICT DO NOTHING`,
    [project.ESHOP, 'LV' + level, 'Eshop card level ' + level, level, String(level)]);
  }

  await db('crm_point_type').whereIn('point_type_code', ['ACTIVITY', 'REGISTER', 'MEMBER']).update({ owner_project_id: project.UID });
  await db('crm_point_type').where('point_type_code', 'SOFT').update({ owner_project_id: project.APPSTORE });
  await db.raw(`INSERT INTO crm_point_type (point_type_code, point_type_name, owner_project_id, is_dream_managed, decimal_places)
                VALUES ('ESHOP_PRIZE', 'Eshop prize balance', ?, false, 3) ON CONFLICT (point_type_code) DO NOTHING`, [project.ESHOP]);
}

/** Service centres in sixteen cities, partner shops that sell, and collection points that take repairs in. */
async function addSites(project) {
  const places = await db('crm_location').whereRaw(locations.isTop('crm_location')).orderBy('location_pk').select('location_pk');
  const sites = [];
  const plan = CITIES.map(function (city) { return ['SERVICE_CENTER', 'Dream Service ' + city, city]; })
    .concat(['Shanghai', 'Beijing', 'Shenzhen', 'Chengdu'].map(function (city) { return ['PARTNER_SHOP', 'Dream Store ' + city, city]; }))
    .concat(['Wuhan', 'Nanjing', 'Xiamen', 'Kunming'].map(function (city) { return ['COLLECTION_POINT', 'Drop-off ' + city, city]; }));

  for (let index = 0; index < plan.length; index += 1) {
    const [kind, name, city] = plan[index];
    // eslint-disable-next-line no-await-in-loop
    const [site] = await db('crm_service_center').insert({
      service_center_code: 'DEMO-' + String(index + 1).padStart(3, '0'),
      service_center_name: name,
      service_center_kind: kind,
      location_pk: places.length ? places[index % places.length].location_pk : null,
      address_line: (10 + index * 7) + ' ' + pick(['Renmin', 'Zhongshan', 'Jiefang', 'Huaihai', 'Nanjing']) + ' Road, ' + city,
      status: 'ACTIVE',
      source_project_id: kind === 'COLLECTION_POINT' ? project.EPRODUCT : project.SMARTPHONE,
      opened_on: daysAgo(between(400, 2000)).toISOString().slice(0, 10)
    }).returning('*');

    const offers = kind === 'SERVICE_CENTER'
      ? [['SMARTPHONE', 'REPAIR'], ['EPRODUCT', 'REPAIR'], ['SMARTPHONE', 'DEVICE_SALE'], ['SMARTPHONE', 'REGISTRATION_ASSIST'], ['APPSTORE', 'LICENCE_ISSUE']]
      : kind === 'PARTNER_SHOP' ? [['SMARTPHONE', 'DEVICE_SALE'], ['EPRODUCT', 'DEVICE_SALE']] : [['EPRODUCT', 'REPAIR']];
    // eslint-disable-next-line no-await-in-loop
    await db('crm_service_center_capability').insert(offers.map(function ([code, capability]) {
      return { service_center_id: site.service_center_id, project_id: project[code], capability_code: capability };
    }));
    sites.push(site);
  }
  return sites;
}

async function addCatalogue(project) {
  const classes = {};
  (await db('crm_product_class').select('product_class_id', 'class_code')).forEach(function (row) { classes[row.class_code] = row.product_class_id; });
  const out = [];
  for (const [code, productCode, name, classCode, kind, price] of CATALOGUE) {
    // eslint-disable-next-line no-await-in-loop
    const [row] = await db('crm_product_catalog').insert({
      project_id: project[code], product_code: productCode, product_name: name, product_kind: kind,
      product_class_id: classCode ? classes[classCode] || null : null, list_price: price, status: 'ACTIVE'
    }).returning('*');
    out.push(Object.assign(row, { projectCode: code, price: price }));
  }
  return out;
}

/* ------------------------------------------------------------------ customers */

/**
 * People, through the same create every console form uses, each with a UID
 * login and membership; about four in ten also shop on the Eshop.
 */
async function addCustomers(project) {
  const people = [];
  for (let index = 0; index < CUSTOMERS; index += 1) {
    const given = GIVEN[index % GIVEN.length];
    const family = FAMILY[Math.floor(index / GIVEN.length) % FAMILY.length] + (index >= GIVEN.length * FAMILY.length ? ' ' + index : '');
    const fullName = given + ' ' + family;
    const joined = recentDay(900);
    const eshop = random() < 0.4;
    // eslint-disable-next-line no-await-in-loop
    const party = await parties.create({
      party_type: 'PERSON', full_name: fullName, origin_project_id: eshop && random() < 0.5 ? project.ESHOP : project.UID,
      mobile: '+86 13' + between(0, 9) + ' ' + String(10000000 + index * 7919 + between(0, 999)).slice(-8),
      email: (given + '.' + family).toLowerCase().replace(/[^a-z.]/g, '') + index + '@mail.example'
    }, null);
    if (!party || !party.party_pk) continue;

    // eslint-disable-next-line no-await-in-loop
    await db('crm_party').where('party_pk', party.party_pk).update({ first_seen_at: joined, last_seen_at: daysAgo(between(0, 60)) });
    const accounts = [[project.UID, 'U' + (100000 + index), 'MEMBER']];
    if (eshop) accounts.push([project.ESHOP, 'E' + (500000 + index), 'ESHOP_CUSTOMER']);
    for (const [projectId, externalId, type] of accounts) {
      // eslint-disable-next-line no-await-in-loop
      const [linked] = await db('crm_project_account').insert({
        party_pk: party.party_pk, project_id: projectId, external_account_pk: externalId, external_account_id: externalId.toLowerCase(),
        external_account_type: type, account_status: 'ACTIVE', is_primary: projectId === project.UID, link_method: 'IMPORT',
        link_confidence: 1, linked_at: joined, source_created_at: joined
      }).returning('project_account_id');
      // eslint-disable-next-line no-await-in-loop
      const tier = projectId === project.ESHOP
        ? await db('crm_project_tier').where({ project_id: project.ESHOP, tier_code: 'LV' + between(1, 5) }).first('project_tier_id') : null;
      // eslint-disable-next-line no-await-in-loop
      // A membership is a tier held by an account: only where the project gave the account one.
      if (tier) await db('crm_membership').insert({
        project_account_id: linked.project_account_id, tier_kind: 'LEVEL', external_member_id: externalId, membership_status: 'ACTIVE',
        current_tier_id: tier.project_tier_id, joined_at: joined, synced_at: daysAgo(between(0, 1))
      });
    }
    people.push({ party_pk: party.party_pk, joined: joined, eshop: eshop });
  }
  return people;
}

/* ------------------------------------------------------------------ what they bought and own */

async function sale(project, code, person, type, at, lines, channel, siteId) {
  const net = Math.round(lines.reduce(function (sum, line) { return sum + line.net_amount; }, 0) * 100) / 100;
  return db.transaction(function (trx) {
    return transactions.upsert(trx, {
      project_id: project[code], external_transaction_id: 'demo:' + code + ':' + person.party_pk + ':' + at.getTime(),
      transaction_type_code: type, transaction_status: 'COMPLETED', currency_code: 'USD', net_amount: net,
      sales_channel_code: channel, service_center_id: siteId || null, transaction_at: at,
      parties: [{ party_pk: person.party_pk, party_role_code: 'BUYER' }], items: lines
    }, 'USD');
  });
}

/**
 * Devices bought at a store or service centre and registered; apps and
 * licences from the Appstore; accessories from the Eshop, with the odd refund.
 */
async function addPurchases(project, people, catalogue, sites) {
  const devices = catalogue.filter(function (row) { return row.product_kind === 'DEVICE'; });
  const phones = devices.filter(function (row) { return row.projectCode === 'SMARTPHONE'; });
  const others = devices.filter(function (row) { return row.projectCode === 'EPRODUCT'; });
  const software = catalogue.filter(function (row) { return row.projectCode === 'APPSTORE'; });
  const goods = catalogue.filter(function (row) { return row.projectCode === 'ESHOP'; });
  const sellers = sites.filter(function (site) { return site.service_center_kind !== 'COLLECTION_POINT'; });
  const owned = [];
  let serial = 0;

  for (const person of people) {
    const span = Math.max(30, Math.floor((Date.now() - person.joined.getTime()) / DAY));
    const holdings = [pick(phones)].concat(random() < 0.6 ? [pick(others)] : []).concat(random() < 0.25 ? [pick(phones)] : []);
    for (const product of holdings) {
      const at = recentDay(span);
      const site = pick(sellers);
      serial += 1;
      // eslint-disable-next-line no-await-in-loop
      const txn = await sale(project, product.projectCode, person, 'SALE', at,
        [{ product_id: product.product_id, external_item_id: product.product_code, quantity: 1, net_amount: product.price }], 'STORE', site.service_center_id);
      // eslint-disable-next-line no-await-in-loop
      const registered = await products.register({
        party_pk: person.party_pk, product_id: product.product_id, serial_number: 'DEMO-SN-' + String(100000 + serial),
        relationship_code: 'OWNER', registration_channel: random() < 0.5 ? 'AGENCY' : 'APP',
        registered_at_service_center_id: site.service_center_id, purchase_date: at.toISOString().slice(0, 10),
        registered_at: new Date(Math.min(Date.now(), at.getTime() + between(0, 5) * DAY))
      }, null, { skipStats: true });
      owned.push({ person: person, product: product, instance: registered.instance, at: at, transaction_id: txn.transaction_id });
    }

    /* the Appstore: a few apps or a licence */
    const apps = between(0, 3);
    for (let count = 0; count < apps; count += 1) {
      const product = pick(software);
      const at = recentDay(span);
      // eslint-disable-next-line no-await-in-loop
      await sale(project, 'APPSTORE', person, product.product_kind === 'LICENCE' ? 'LICENCE_PURCHASE' : 'APP_PURCHASE', at,
        [{ product_id: product.product_id, external_item_id: product.product_code, quantity: 1, net_amount: product.price }], 'APP');
    }

    /* the Eshop: accessories, more often for those with an Eshop account */
    const orders = person.eshop ? between(1, 7) : (random() < 0.15 ? 1 : 0);
    for (let count = 0; count < orders; count += 1) {
      const at = recentDay(span);
      const lines = [pick(goods), pick(goods)].slice(0, between(1, 2)).map(function (product) {
        const quantity = between(1, 3);
        return { product_id: product.product_id, external_item_id: product.product_code, quantity: quantity, net_amount: product.price * quantity };
      });
      // eslint-disable-next-line no-await-in-loop
      const order = await sale(project, 'ESHOP', person, 'SALE', at, lines, 'WEB');
      if (random() < 0.06) {
        // eslint-disable-next-line no-await-in-loop
        await db.transaction(function (trx) {
          return transactions.upsert(trx, {
            project_id: project.ESHOP, external_transaction_id: 'demo:refund:' + order.transaction_id, original_transaction_id: order.transaction_id,
            transaction_type_code: 'REFUND', transaction_status: 'REFUNDED', currency_code: 'USD', net_amount: -lines[0].net_amount,
            sales_channel_code: 'WEB', transaction_at: new Date(at.getTime() + 3 * DAY), parties: [{ party_pk: person.party_pk, party_role_code: 'BUYER' }]
          }, 'USD');
        });
      }
    }
  }
  return owned;
}

/* ------------------------------------------------------------------ service */

/**
 * Repairs on the devices people own: most closed and rated, some still open,
 * a few past their due date. A paid repair is a SERVICE_PAYMENT in the
 * device's project; intake and hand-back are site activity.
 */
async function addRepairs(project, owned, sites) {
  const counters = sites.filter(function (site) { return site.service_center_kind !== 'PARTNER_SHOP'; });
  const statuses = {};
  (await db('crm_service_status').select('service_status_id', 'status_code')).forEach(function (row) { statuses[row.status_code] = row.service_status_id; });
  const caseTypes = {};
  (await db('crm_service_case_type').select('case_type_id', 'case_type_code')).forEach(function (row) { caseTypes[row.case_type_code] = row.case_type_id; });
  const priorities = {};
  (await db('crm_service_priority').select('service_priority_id', 'priority_code')).forEach(function (row) { priorities[row.priority_code] = row.service_priority_id; });
  const activityTypes = {};
  (await db('crm_service_center_activity_type').select('activity_type_id', 'activity_code')).forEach(function (row) { activityTypes[row.activity_code] = row.activity_type_id; });
  let added = 0;

  for (const holding of owned) {
    const visits = random() < 0.55 ? between(1, 3) : 0;
    for (let visit = 0; visit < visits; visit += 1) {
      const age = Math.floor((Date.now() - holding.at.getTime()) / DAY);
      if (age < 5) continue;
      const received = daysAgo(between(0, Math.min(age, 540)));
      const ageOfCase = (Date.now() - received.getTime()) / DAY;
      const open = ageOfCase < 12 && random() < 0.6;
      const status = open ? pick(['RECEIVED', 'DIAGNOSING', 'WAITING_PARTS', 'IN_REPAIR', 'READY']) : (random() < 0.06 ? 'CANCELLED' : 'CLOSED');
      const closed = open ? null : new Date(received.getTime() + between(1, 6) * DAY + between(0, 20) * 3600000);
      const warranty = ageOfCase < 365 && random() < 0.5;
      const cost = warranty ? 0 : between(20, 180);
      const site = pick(counters);
      // eslint-disable-next-line no-await-in-loop
      const [serviceCase] = await db('crm_service_case').insert({
        party_pk: holding.person.party_pk, project_id: project[holding.product.projectCode],
        external_case_id: 'DEMO-R' + String(10000 + added), service_center_id: site.service_center_id,
        case_type_id: warranty ? caseTypes.WARRANTY_REPAIR : caseTypes.REPAIR, service_status_id: statuses[status],
        service_priority_id: priorities[pick(['LOW', 'NORMAL', 'NORMAL', 'HIGH'])], reception_channel_code: pick(['WALK_IN', 'WALK_IN', 'MAIL_IN', 'COURIER']),
        related_product_instance_id: holding.instance.product_instance_id, is_warranty: warranty,
        title: pick(['Screen flickers', 'Does not charge', 'No sound', 'Will not turn on', 'Overheats', 'Wi-Fi drops', 'Cracked screen']),
        received_at: received, first_response_at: new Date(received.getTime() + 4 * 3600000),
        due_at: new Date(received.getTime() + 5 * DAY), completed_at: closed, closed_at: closed,
        total_cost: cost, customer_paid_amount: status === 'CLOSED' ? cost : null, currency_code: 'USD',
        satisfaction_rating: status === 'CLOSED' && random() < 0.7 ? pick([3, 4, 4, 5, 5, 5]) : null,
        source_created_at: received, ingested_at: received
      }).returning('*');
      added += 1;

      if (status === 'CLOSED' && cost > 0) {
        // eslint-disable-next-line no-await-in-loop
        const payment = await db.transaction(function (trx) {
          return transactions.upsert(trx, {
            project_id: serviceCase.project_id, external_transaction_id: 'demo:repair:' + serviceCase.case_id,
            transaction_type_code: 'SERVICE_PAYMENT', transaction_status: 'PAID', currency_code: 'USD', net_amount: cost,
            sales_channel_code: 'SERVICE_CENTRE', service_center_id: site.service_center_id, transaction_at: closed,
            parties: [{ party_pk: holding.person.party_pk, party_role_code: 'BUYER' }],
            items: [{ external_item_id: serviceCase.external_case_id, product_instance_id: holding.instance.product_instance_id, quantity: 1, net_amount: cost }]
          }, 'USD');
        });
        // eslint-disable-next-line no-await-in-loop
        await db('crm_service_case').where('case_id', serviceCase.case_id).update({ related_transaction_id: payment.transaction_id });
      }

      const activities = [[activityTypes.REPAIR_INTAKE, received, 'intake']];
      if (status === 'CLOSED') activities.push([activityTypes.REPAIR_DELIVERY, closed, 'delivery']);
      // eslint-disable-next-line no-await-in-loop
      await db('crm_service_center_activity').insert(activities.filter(function (row) { return row[0]; }).map(function ([typeId, at, step]) {
        return {
          service_center_id: site.service_center_id, activity_type_id: typeId, project_id: serviceCase.project_id, occurred_at: at,
          party_pk: holding.person.party_pk, related_service_case_id: serviceCase.case_id,
          related_product_instance_id: holding.instance.product_instance_id, status: 'COMPLETED',
          external_activity_id: 'demo:' + serviceCase.case_id + ':' + step
        };
      }));
    }
  }
  return added;
}

/* ------------------------------------------------------------------ points */

/** Member points: earned on every purchase, a dollar a point, and now and then spent. */
async function addPoints() {
  const member = await db('crm_point_type').where('point_type_code', 'MEMBER').first('point_type_id');
  if (!member) return 0;
  const bought = await db('crm_transaction as sale').join('crm_transaction_party as buyer', 'buyer.transaction_id', 'sale.transaction_id')
    .where('buyer.party_role_code', 'BUYER').where('sale.net_amount', '>', 0)
    .orderBy('sale.transaction_at').select('sale.transaction_id', 'sale.net_amount', 'sale.transaction_at', 'buyer.party_pk');
  let posted = 0;
  await db.transaction(async function (trx) {
    for (const row of bought) {
      const points = Math.floor(Number(row.net_amount));
      if (!points) continue;
      // eslint-disable-next-line no-await-in-loop
      await ledger.post(trx, {
        party_pk: row.party_pk, point_type_id: member.point_type_id, event_code: 'EARN', points_delta: points,
        related_transaction_id: row.transaction_id, description: 'Points for a purchase', occurred_at: row.transaction_at
      });
      posted += 1;
      if (random() < 0.12) {
        // eslint-disable-next-line no-await-in-loop
        const account = await trx('crm_point_account').where({ party_pk: row.party_pk, point_type_id: member.point_type_id }).first('balance');
        const spend = Math.floor(Number(account.balance) * 0.5);
        if (spend > 0) {
          // eslint-disable-next-line no-await-in-loop
          await ledger.post(trx, {
            party_pk: row.party_pk, point_type_id: member.point_type_id, event_code: 'REDEEM', points_delta: -spend,
            description: 'Spent on a voucher', occurred_at: new Date(new Date(row.transaction_at).getTime() + 2 * DAY)
          });
          posted += 1;
        }
      }
    }
  });
  return posted;
}

/* ------------------------------------------------------------------ the run */

async function run() {
  if (await db('crm_service_center').where('service_center_code', 'DEMO-001').first()) return { skipped: 'the demo data is already there' };

  const summary = {};
  const project = await addProjects();
  await addProjectSettings(project);
  try {
    summary.locations = await db.transaction(function (trx) { return locations.refresh(trx); });
  } catch (err) {
    summary.locations = 'not reachable - ' + err.message;
  }
  const sites = await addSites(project);
  const catalogue = await addCatalogue(project);
  const people = await addCustomers(project);
  const owned = await addPurchases(project, people, catalogue, sites);
  summary.projects = Object.keys(project).length;
  summary.sites = sites.length;
  summary.products = catalogue.length;
  summary.customers = people.length;
  summary.devices = owned.length;
  summary.repairs = await addRepairs(project, owned, sites);
  summary.point_events = await addPoints();
  summary.class_stats = await analysis.recalculateClassStats();
  summary.analysis = await analysisRun.run();
  return summary;
}

module.exports = { run: run };

if (require.main === module) {
  run().then(function (summary) { console.log(JSON.stringify(summary)); process.exit(0); })
    .catch(function (err) { console.error(err); process.exit(1); });
}
