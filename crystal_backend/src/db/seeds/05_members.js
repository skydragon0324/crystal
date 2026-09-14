const bcrypt = require('bcryptjs');

/**
 * Members, the devices they own, and the cover on those devices.
 *
 * The chain matters more than the volume: a serial exists in the warehouse
 * mirror, a member registers it, the registration issues a warranty from the
 * policy that applies to that product, and a repair ticket in seed 06 finds
 * that warranty by serial number and date.  Break any link and the ticket
 * seed silently produces uncovered repairs, and the claim module has nothing
 * to settle.
 */

const NICKNAMES = ['Ming', 'Xiao', 'Ling', 'Hua', 'Jie', 'Yun', 'Peng', 'Rui', 'Dan', 'Feng',
  'Qing', 'Shan', 'Tian', 'Wen', 'Xue', 'Ying', 'Zhi', 'Bing', 'Cong', 'Duo',
  'Fei', 'Gang', 'Han', 'Jia', 'Kun', 'Lan', 'Mei', 'Ning', 'Ou', 'Ping'];

/** Deterministic, so the same seed always produces the same database. */
function rng(seed) {
  let state = seed;
  return function next(max) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % max;
  };
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function addMonths(startDate, months) {
  const d = new Date(startDate + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

const MEMBER_COUNT = 60;
const SERIALS_PER_PRODUCT = 14;

exports.seed = async function seed(knex) {
  const random = rng(20260825);
  const products = await knex('products').select('id', 'slug', 'name', 'model_code', 'price',
    'category_id', 'series_id', 'warranty_months');
  const policies = await knex('warranty_policies')
    .where({ is_default: true, status: 'ACTIVE' })
    .select('id', 'category_id', 'series_id', 'months', 'covers_parts', 'covers_labour',
      'covers_accidental', 'claim_limit');

  /** The most specific default policy wins - series beats category. */
  function policyFor(product) {
    return policies.find(function (p) { return p.series_id === product.series_id; })
      || policies.find(function (p) { return p.series_id === null && p.category_id === product.category_id; })
      || null;
  }

  /* ---- the warehouse mirror ---- */
  const serials = [];
  const factories = ['SZ-01', 'SZ-02', 'CQ-01'];

  products.forEach(function (product, pi) {
    for (let i = 0; i < SERIALS_PER_PRODUCT; i += 1) {
      /*
       * Three years of production, not one.
       *
       * The window has to be wider than the longest warranty or every device
       * in the database is still covered, every repair is free, and the whole
       * settlement half of the business has nothing to charge anybody for.
       * At 1100 days a realistic minority of repairs fall outside cover.
       */
      const madeDaysAgo = 30 + random(1100);
      // Batches are what the defect watch groups by, so they have to be
      // coarse enough that several devices share one.
      const batch = product.model_code + '-B' + String(Math.floor(madeDaysAgo / 90) + 1);

      serials.push({
        serial_number: (product.model_code + String(100000 + pi * 1000 + i)).replace(/-/g, ''),
        model_code: product.model_code,
        product_id: product.id,
        manufactured_on: isoDaysAgo(madeDaysAgo),
        warranty_until: addMonths(isoDaysAgo(madeDaysAgo), product.warranty_months),
        factory_code: factories[(pi + i) % factories.length],
        batch_code: batch,
        status: 'AVAILABLE'
      });
    }
  });

  await knex('oracle_serials').insert(serials);

  /* ---- members ---- */
  const passwordHash = bcrypt.hashSync('crystal1234', 10);
  const users = [];

  for (let i = 0; i < MEMBER_COUNT; i += 1) {
    users.push({
      email: 'member' + (i + 1) + '@crystal.example',
      phone: '+86138' + String(11110000 + i),
      password_hash: passwordHash,
      nickname: NICKNAMES[i % NICKNAMES.length] + (i >= NICKNAMES.length ? String(Math.floor(i / NICKNAMES.length) + 1) : ''),
      status: i % 25 === 24 ? 'LOCKED' : 'ACTIVE',
      created_at: new Date(Date.now() - (30 + random(700)) * 86400000)
    });
  }

  /*
   * The demo account, named rather than numbered so the README can quote it.
   * Both a desktop and a mobile handle, because spec 5 needs one of each to
   * be exercisable end to end.
   */
  users.unshift({
    email: 'demo@crystal.example',
    phone: '+8613800000001',
    password_hash: passwordHash,
    nickname: 'Crystal demo',
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 400 * 86400000)
  });

  const userRows = await knex('users').insert(users).returning(['id', 'nickname']);

  /* Every member has a wallet from the first moment, so no later code path
   * has to cope with its absence. */
  await knex('wallets').insert(userRows.map(function (user) {
    return {
      user_id: user.id,
      /*
       * Both totals start at zero and are written later from the ledgers they
       * cache - points at the end of this file, money in seed 08.
       *
       * An opening balance invented here would be money with no transaction
       * behind it: the member centre renders a statement that does not add up
       * to the balance printed above it, and wallet.repository's own
       * reconciliation query reports every account as drifted.
       */
      balance: 0,
      point_balance: 0,
      currency: 'USD'
    };
  }));

  /* ---- registrations, and the cover each one issues ---- */
  const available = serials.slice();
  const registrations = [];
  const warranties = [];
  const pointLogs = [];
  const balances = {};

  let warrantySeq = 0;

  for (let u = 0; u < userRows.length; u += 1) {
    const user = userRows[u];
    // A realistic spread: most members own one or two devices, a few own five.
    const deviceCount = 1 + random(u === 0 ? 4 : 3);
    balances[user.id] = 0;

    for (let d = 0; d < deviceCount && available.length; d += 1) {
      const serial = available.splice(random(available.length), 1)[0];
      const product = products.find(function (p) { return p.id === serial.product_id; });
      if (!product) continue;

      const purchasedDaysAgo = Math.max(1, Math.floor(
        (Date.now() - Date.parse(serial.manufactured_on)) / 86400000
      ) - random(30));
      const purchaseDate = isoDaysAgo(purchasedDaysAgo);
      const policy = policyFor(product);
      const months = policy ? policy.months : product.warranty_months;
      const endDate = addMonths(purchaseDate, months);

      registrations.push({
        user_id: user.id,
        product_id: product.id,
        serial_number: serial.serial_number,
        nickname: user.nickname + "'s " + product.name,
        purchase_date: purchaseDate,
        warranty_until: endDate,
        points: 500,
        register_time: new Date(Date.parse(purchaseDate) + 86400000 * (1 + random(20)))
      });

      warrantySeq += 1;
      warranties.push({
        warranty_no: 'W' + new Date().getFullYear() + String(warrantySeq).padStart(5, '0'),
        user_id: user.id,
        product_id: product.id,
        serial_number: serial.serial_number,
        policy_id: policy ? policy.id : null,
        kind: 'STANDARD',
        source: 'REGISTRATION',
        start_date: purchaseDate,
        end_date: endDate,
        covers_parts: policy ? policy.covers_parts : true,
        covers_labour: policy ? policy.covers_labour : true,
        covers_accidental: policy ? policy.covers_accidental : false,
        claim_limit: policy ? policy.claim_limit : 0,
        // Cover whose last day has passed is EXPIRED, exactly as the nightly
        // sweep would have left it.
        status: Date.parse(endDate) < Date.now() ? 'EXPIRED' : 'ACTIVE'
      });

      balances[user.id] += 500;
      pointLogs.push({
        user_id: user.id, type: 'PRODUCT_REGISTER', amount: 500,
        balance_after: balances[user.id],
        description: 'Registered ' + product.name,
        reference: serial.serial_number,
        created_at: new Date(Date.parse(purchaseDate) + 86400000)
      });
    }
  }

  await knex('registered_products').insert(registrations);
  await knex('warranties').insert(warranties);

  /*
   * A handful of members bought an extension.
   *
   * These are the rows that make the "most specific cover wins" rule in the
   * warranty repository observable: a device with both a standard cover and a
   * CARE_PLUS running at once must have its repair booked against the Care+
   * one, because that is the plan the member actually paid for.
   */
  const carePolicies = await knex('warranty_policies')
    .whereIn('kind', ['EXTENDED', 'CARE_PLUS'])
    .where('status', 'ACTIVE')
    .select('*');

  const activeWarranties = await knex('warranties')
    .where('status', 'ACTIVE')
    .orderBy('id')
    .select('id', 'user_id', 'product_id', 'serial_number', 'end_date');

  const extensions = [];

  for (let i = 0; i < activeWarranties.length; i += 4) {
    const base = activeWarranties[i];
    const product = products.find(function (p) { return p.id === base.product_id; });
    if (!product) continue;

    const policy = carePolicies.find(function (p) { return p.series_id === product.series_id; })
      || carePolicies.find(function (p) { return p.series_id === null && p.category_id === product.category_id; });
    if (!policy) continue;

    // Starts the day after the existing cover ends: renewing early must not
    // cost the member the days they already paid for.
    const start = new Date(Date.parse(base.end_date) + 86400000).toISOString().slice(0, 10);

    warrantySeq += 1;
    extensions.push({
      warranty_no: 'W' + new Date().getFullYear() + String(warrantySeq).padStart(5, '0'),
      user_id: base.user_id,
      product_id: base.product_id,
      serial_number: base.serial_number,
      policy_id: policy.id,
      kind: policy.kind,
      source: 'EXTENSION',
      start_date: start,
      end_date: addMonths(start, policy.months),
      covers_parts: policy.covers_parts,
      covers_labour: policy.covers_labour,
      covers_accidental: policy.covers_accidental,
      claim_limit: policy.claim_limit,
      price_paid: policy.price,
      currency: policy.currency,
      status: 'ACTIVE'
    });
  }

  if (extensions.length) await knex('warranties').insert(extensions);

  /* ---- licences, for the devices the spec says need one ---- */
  const licensable = await knex('registered_products as r')
    .join('products as p', 'p.id', 'r.product_id')
    .join('product_categories as c', 'c.id', 'p.category_id')
    .whereIn('c.type', ['TV', 'STB'])
    .limit(30)
    .select('r.id', 'r.user_id', 'r.serial_number', 'c.type', 'p.slug');

  const licences = [];
  licensable.forEach(function (row, i) {
    const cost = 1000;
    balances[row.user_id] = (balances[row.user_id] || 0) - cost;

    licences.push({
      user_id: row.user_id,
      registered_product_id: row.id,
      device_type: row.slug.indexOf('karaoke') !== -1 ? 'KARAOKE' : row.type,
      device_sn: row.serial_number,
      device_no: 'D' + String(1000 + i),
      license_key: 'CR-' + row.serial_number.slice(-8) + '-' + String(100000 + i * 7),
      points_used: cost,
      valid_until: isoDaysAgo(-365),
      status: 'ACTIVE'
    });

    pointLogs.push({
      user_id: row.user_id, type: 'LICENSE', amount: -cost,
      balance_after: balances[row.user_id],
      description: 'Device licence for ' + row.serial_number,
      reference: row.serial_number
    });
  });

  if (licences.length) await knex('licenses').insert(licences);
  await knex('point_logs').insert(pointLogs);

  /*
   * The cached point balance, set from the ledger it is a cache of.
   *
   * `npm run check` asserts these two agree, so writing the cache from
   * anything other than the sum of the log would make the seed fail its own
   * consistency test - which is the point of having the test.
   */
  const totals = await knex('point_logs')
    .groupBy('user_id')
    .select('user_id', knex.raw('SUM(amount) AS total'));

  for (let i = 0; i < totals.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await knex('wallets').where('user_id', totals[i].user_id)
      .update({ point_balance: Number(totals[i].total) });
  }
};
