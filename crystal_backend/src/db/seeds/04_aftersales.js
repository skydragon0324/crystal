/**
 * The after-sales master data: what can go wrong, what fixes it, who fits it
 * and what the cover is.
 *
 * The stock levels below are deliberately not uniform.  Two centres are left
 * genuinely short - see SHORT_CENTRES - because a parts module seeded so that
 * nothing is ever missing cannot demonstrate the one thing it exists for, and
 * the health board's PARTS_BOUND status would never appear.
 */

/* code, name, component, severity */
const SYMPTOMS = [
  ['SCR_CRACK', 'Screen cracked or broken', 'DISPLAY', 2],
  ['SCR_FLICK', 'Screen flickering or lines', 'DISPLAY', 2],
  ['SCR_TOUCH', 'Touch not responding', 'DISPLAY', 2],
  ['BAT_DRAIN', 'Battery drains quickly', 'BATTERY', 1],
  ['BAT_SWELL', 'Battery swollen', 'BATTERY', 3],
  ['BAT_NOCHG', 'Will not charge', 'BATTERY', 2],
  ['PWR_DEAD', 'Will not power on', 'POWER', 2],
  ['PWR_OVERHEAT', 'Device overheating', 'POWER', 3],
  ['CAM_BLUR', 'Camera blurred or will not focus', 'CAMERA', 1],
  ['CAM_FAIL', 'Camera not detected', 'CAMERA', 2],
  ['AUD_SPK', 'No sound from speaker', 'AUDIO', 1],
  ['AUD_MIC', 'Microphone not working', 'AUDIO', 2],
  ['NET_SIG', 'No mobile signal', 'NETWORK', 2],
  ['NET_WIFI', 'Wi-Fi will not connect', 'NETWORK', 1],
  ['SW_BOOT', 'Stuck on the boot screen', 'SOFTWARE', 2],
  ['SW_SLOW', 'Slow or freezing', 'SOFTWARE', 1],
  ['SW_UPDATE', 'Update failed', 'SOFTWARE', 1],
  ['CASE_DAMAGE', 'Casing damaged', 'CASING', 0],
  ['CASE_WATER', 'Liquid damage', 'CASING', 2],
  ['OTHER', 'Something else', 'OTHER', 1]
];

/* suffix, name, component, cost share of device price, warranty months, lead days */
const PART_KINDS = [
  ['SCR', 'Display assembly', 'DISPLAY', 0.18, 6, 10],
  ['BAT', 'Battery pack', 'BATTERY', 0.05, 6, 5],
  ['PRT', 'Charging port board', 'POWER', 0.03, 3, 7],
  ['CAM', 'Rear camera module', 'CAMERA', 0.10, 6, 12],
  ['SPK', 'Speaker module', 'AUDIO', 0.02, 3, 5],
  ['BGL', 'Rear glass panel', 'CASING', 0.06, 3, 8],
  ['MBD', 'Mainboard', 'BOARD', 0.30, 12, 21]
];

/** Which price line consumes which kind of part. */
const PRICE_TO_PART = {
  'Screen replacement': 'SCR',
  'Battery replacement': 'BAT',
  'Charging port repair': 'PRT',
  'Rear camera module': 'CAM',
  'Speaker replacement': 'SPK',
  'Rear glass replacement': 'BGL',
  'Motherboard repair': 'MBD'
};

/** Centres left short on purpose, so the shortage paths have something to show. */
const SHORT_CENTRES = ['SC01', 'YN01'];

/**
 * When the centres were first stocked.
 *
 * Every shelf's opening balance is dated here, which has to be before the
 * oldest repair seed 06 books against it - a shelf cannot issue a part in
 * March out of stock it received in August.
 */
const OPENING_DAYS_AGO = 400;

/* name suffix, grade, skills */
const TECHNICIAN_TEMPLATE = [
  ['Senior technician', 3, { DISPLAY: 3, BATTERY: 3, BOARD: 2, POWER: 3 }],
  ['Technician', 2, { DISPLAY: 2, BATTERY: 3, CAMERA: 2, AUDIO: 2 }],
  ['Technician', 2, { SOFTWARE: 3, NETWORK: 3, POWER: 2 }],
  ['Trainee', 1, { CASING: 2, BATTERY: 1, SOFTWARE: 1 }]
];

const FIRST_NAMES = ['Wei', 'Fang', 'Jing', 'Lei', 'Min', 'Yan', 'Hui', 'Qiang', 'Na', 'Jun',
  'Ling', 'Tao', 'Xin', 'Bo', 'Yu', 'Chen', 'Hao', 'Mei', 'Ping', 'Kai'];
const SURNAMES = ['Zhang', 'Wang', 'Li', 'Zhao', 'Chen', 'Liu', 'Yang', 'Huang', 'Wu', 'Zhou'];

exports.seed = async function seed(knex) {
  const categories = await knex('product_categories').select('id', 'type');
  const seriesRows = await knex('product_series').select('id', 'slug', 'category_id');
  const products = await knex('products').select('id', 'slug', 'name', 'price', 'series_id', 'category_id');
  const agencies = await knex('agencies').select('id', 'code', 'tier', 'daily_capacity');

  const phoneCategory = categories.find(function (c) { return c.type === 'SMARTPHONE'; });

  /* ---- symptoms ---- */
  await knex('symptom_catalog').insert(SYMPTOMS.map(function (row, i) {
    return {
      code: row[0], name: row[1], component: row[2], severity: row[3],
      // Software and casing faults happen on everything; the rest are asked
      // about handsets far more than anything else.
      category_id: ['SOFTWARE', 'OTHER', 'CASING'].indexOf(row[2]) === -1 && phoneCategory
        ? phoneCategory.id : null,
      sort_order: (i + 1) * 10
    };
  }));

  /* ---- warranty policies ---- */
  const policies = [];

  categories.forEach(function (category, index) {
    const standardMonths = category.type === 'SMARTPHONE' ? 12 : 24;

    policies.push({
      code: category.type + '_STD', name: category.type + ' standard warranty',
      category_id: category.id, kind: 'STANDARD', months: standardMonths,
      covers_parts: true, covers_labour: true, covers_accidental: false,
      is_default: true, sort_order: (index + 1) * 10, status: 'ACTIVE'
    });

    policies.push({
      code: category.type + '_EXT12', name: category.type + ' 12 month extension',
      category_id: category.id, kind: 'EXTENDED', months: 12,
      covers_parts: true, covers_labour: true, covers_accidental: false,
      price: 79, points_price: 8000, sort_order: (index + 1) * 10 + 1, status: 'ACTIVE'
    });
  });

  /*
   * The flagship lines get 24 months as standard rather than 12, and a
   * Care+ plan on top.  Pinned to the SERIES rather than to the category,
   * which is what the "most specific policy wins" rule in the warranty
   * repository exists to resolve - without a narrower row to beat the
   * broader one, that rule would never fire.
   */
  ['c9', 'c7'].forEach(function (slug, index) {
    const series = seriesRows.find(function (s) { return s.slug === slug; });
    if (!series) return;

    policies.push({
      code: slug.toUpperCase() + '_STD24', name: slug.toUpperCase() + ' standard warranty',
      series_id: series.id, kind: 'STANDARD', months: 24,
      covers_parts: true, covers_labour: true, covers_accidental: false,
      is_default: true, sort_order: 100 + index, status: 'ACTIVE'
    });

    policies.push({
      code: slug.toUpperCase() + '_CARE', name: 'Crystal Care+ for ' + slug.toUpperCase(),
      series_id: series.id, kind: 'CARE_PLUS', months: 24,
      covers_parts: true, covers_labour: true, covers_accidental: true,
      // Accidental cover has to be capped, or it is not insurance - it is a
      // subscription to free screens.
      claim_limit: 2,
      price: 199, points_price: 20000, sort_order: 110 + index, status: 'ACTIVE'
    });
  });

  await knex('warranty_policies').insert(policies);

  /* ---- parts, one set per product ---- */
  const partIds = {};      // 'slug:SCR' -> id
  const compat = [];

  for (let p = 0; p < products.length; p += 1) {
    const product = products[p];

    for (let k = 0; k < PART_KINDS.length; k += 1) {
      const [suffix, name, component, share, warrantyMonths, leadDays] = PART_KINDS[k];

      // eslint-disable-next-line no-await-in-loop
      const rows = await knex('parts').insert({
        part_no: 'P-' + product.slug.toUpperCase().replace(/-/g, '') + '-' + suffix,
        name: name + ' - ' + product.name,
        component: component,
        unit_cost: Math.round(Number(product.price) * share),
        currency: 'USD',
        warranty_months: warrantyMonths,
        lead_days: leadDays,
        status: 'ACTIVE'
      }).returning('id');

      const id = typeof rows[0] === 'object' ? rows[0].id : rows[0];
      partIds[product.slug + ':' + suffix] = id;
      compat.push({ part_id: id, product_id: product.id });
    }
  }

  await knex('part_compatibility').insert(compat);

  /*
   * Now the price list can say which shelf each line takes stock off.
   *
   * Done here rather than in seed 03 because the parts did not exist yet -
   * and without it a clerk adding "screen replacement" to a ticket would have
   * to pick the part again from a second list, which is how the two drift.
   */
  /*
   * NOTHING TO DO HERE ANY MORE.
   *
   * A published price line used to carry the shelf item it consumed, and
   * this loop is what attached it. The column is gone: the price list is
   * what a customer reads, and which part comes off which shelf is the
   * REPAIR's business - a ticket line carries its own part_id.
   *
   * PRICE_TO_PART survives because seed 06 still needs it, to pick a
   * plausible part when it builds a ticket from a price line.
   */

  /* ---- technicians ---- */
  const technicians = [];
  const skills = [];

  agencies.forEach(function (agency, a) {
    // A collection point has one person; a factory service centre has six.
    const headcount = agency.tier === 0 ? 1 : Math.min(6, 2 + agency.tier + Math.floor(agency.daily_capacity / 20));

    for (let t = 0; t < headcount; t += 1) {
      const template = TECHNICIAN_TEMPLATE[t % TECHNICIAN_TEMPLATE.length];
      technicians.push({
        agency_id: agency.id,
        code: agency.code + '-T' + String(t + 1).padStart(2, '0'),
        name: SURNAMES[(a + t) % SURNAMES.length] + ' ' + FIRST_NAMES[(a * 3 + t) % FIRST_NAMES.length],
        phone: '138' + String(10000000 + a * 100 + t),
        grade: template[1],
        daily_minutes: template[1] === 1 ? 300 : 420,
        hired_on: new Date(Date.now() - (200 + a * 30 + t * 40) * 86400000).toISOString().slice(0, 10),
        status: 'ACTIVE',
        __skills: template[2]
      });
    }
  });

  for (let i = 0; i < technicians.length; i += 1) {
    const row = Object.assign({}, technicians[i]);
    const skillMap = row.__skills;
    delete row.__skills;

    // eslint-disable-next-line no-await-in-loop
    const inserted = await knex('technicians').insert(row).returning('id');
    const id = typeof inserted[0] === 'object' ? inserted[0].id : inserted[0];

    Object.keys(skillMap).forEach(function (component) {
      skills.push({ technician_id: id, component: component, level: skillMap[component] });
    });
  }

  await knex('technician_skills').insert(skills);

  /*
   * Stock, and the opening receipt that put it there.
   *
   * Written through the ledger rather than straight into part_stock, because
   * the whole design of the stock module is that on_hand is a cache of the
   * movements - and a seed that sets the cache without the movements would
   * make `npm run check` fail on its first run, correctly, by finding the
   * ledger and the cache disagreeing.
   *
   * A centre only stocks what it can fit: a collection point holds batteries
   * and nothing else, a factory centre holds everything.
   */
  const STOCKED_BY_TIER = {
    0: ['BAT'],
    1: ['SCR', 'BAT', 'PRT', 'SPK'],
    2: ['SCR', 'BAT', 'PRT', 'CAM', 'SPK', 'BGL'],
    3: ['SCR', 'BAT', 'PRT', 'CAM', 'SPK', 'BGL', 'MBD']
  };

  // Only the handsets are held at every centre - nobody stocks a spare 85in
  // television panel in a shopping centre.
  const stockedProducts = products.filter(function (product) {
    return ['c9-pro', 'c9', 'c7-pro', 'c7', 'c5-plus', 'c5', 'c3'].indexOf(product.slug) !== -1;
  });

  const stockRows = [];
  const movementRows = [];
  const openedAt = new Date(Date.now() - OPENING_DAYS_AGO * 86400000);

  agencies.forEach(function (agency) {
    const kinds = STOCKED_BY_TIER[agency.tier] || STOCKED_BY_TIER[1];
    const short = SHORT_CENTRES.indexOf(agency.code) !== -1;

    stockedProducts.forEach(function (product, pi) {
      kinds.forEach(function (suffix, ki) {
        const partId = partIds[product.slug + ':' + suffix];
        if (!partId) return;

        const reorderLevel = suffix === 'BAT' ? 6 : 3;

        // A deterministic spread, so the same seed always produces the same
        // shortages and a screenshot of the health board is reproducible.
        const spread = (pi * 3 + ki * 5 + agency.id * 7) % 11;
        const onHand = short
          ? Math.max(0, spread % 4)                        // routinely at or under the level
          : reorderLevel + 2 + (spread % 9);

        stockRows.push({
          agency_id: agency.id, part_id: partId,
          on_hand: onHand, reserved: 0, reorder_level: reorderLevel,
          bin: String.fromCharCode(65 + (ki % 6)) + String(pi + 1).padStart(2, '0')
        });

        if (onHand > 0) {
          movementRows.push({
            agency_id: agency.id, part_id: partId,
            movement: 'RECEIPT', quantity: onHand, balance_after: onHand,
            unit_cost: 0, reference_type: 'STOCKTAKE',
            note: 'opening balance', manager_name: 'system',
            /*
             * Backdated, and it has to be.
             *
             * Left to the column default this row is stamped `now()`, which
             * puts the opening balance AFTER every part seed 06 then issues
             * against it - six months of repairs drawing on a shelf that,
             * according to its own ledger, was not stocked until today.  The
             * totals still reconcile, so `npm run check` stays green and the
             * stock movements screen quietly shows a running balance that
             * counts backwards.
             *
             * OPENING_DAYS_AGO sits comfortably before the oldest ticket seed
             * 06 writes, so the ledger reads in the order it happened.
             */
            created_at: openedAt
          });
        }
      });
    });
  });

  await knex('part_stock').insert(stockRows);
  if (movementRows.length) await knex('part_movements').insert(movementRows);
};
