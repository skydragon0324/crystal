/**
 * Deterministic fixture data for the vendor site.
 *
 * Everything here is generated from a fixed seed, so two runs produce byte
 * identical rows. That matters for a test fixture: a page that renders 24
 * agencies today has to render the same 24 tomorrow, or nothing built on
 * top of it can assert anything.
 *
 * Field names deliberately mirror the columns the real models select, so a
 * page cannot tell a mock response from a database one. See mock/README.md.
 */
const md5 = require('md5');

/* ------------------------------------------------------------------ *
 * Seeded pseudo-random helpers
 * ------------------------------------------------------------------ */

// mulberry32 - small, fast, and stable across Node versions, which
// Math.random() with a monkey-patched seed is not.
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20240817);

const int = (min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (arr) => arr[int(0, arr.length - 1)];
const chance = (pct) => rng() * 100 < pct;

// A fixed "now" so relative timestamps never drift between runs.
const NOW = new Date('2026-06-30T09:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

const pad = (n) => (n < 10 ? '0' + n : '' + n);

/** 'YYYY-MM-DD HH:mm:ss', the format the real controllers hand back. */
function stamp(daysAgo, hour, minute) {
  const d = new Date(NOW - daysAgo * DAY);
  if (hour !== undefined) d.setUTCHours(hour, minute || 0, 0, 0);
  return (
    d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
    ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds())
  );
}

const dateOnly = (daysAgo) => stamp(daysAgo).slice(0, 10);

/* ------------------------------------------------------------------ *
 * Users
 *
 * Passwords are stored as the MD5 the client sends, because
 * api/client/authApi.js hashes before it posts. Storing the plaintext
 * here would make every login fail for a reason nobody could see.
 * ------------------------------------------------------------------ */

const USERS = [
  {
    user_pk: 1001,
    user_id: 'demo',
    password: md5('1234'),
    user_name: 'Demo User',
    gender: 1,
    birthday: '1992-04-18',
    cid: '1980001234',
    status: 1,
    user_type: 0,          // PID
    phone_number: '191-234-5678',
    email: 'demo@example.com',
    point: 24800,
    created_at: stamp(900),
  },
  {
    user_pk: 1002,
    user_id: 'tester',
    password: md5('123456'),
    user_name: 'QA Tester',
    gender: 0,
    birthday: '1988-11-02',
    cid: '1980005678',
    status: 1,
    user_type: 0,
    phone_number: '191-777-1020',
    email: 'tester@example.com',
    point: 7350,
    created_at: stamp(640),
  },
  {
    user_pk: 2001,
    user_id: 'fixed01',
    password: md5('1234'),
    user_name: 'Fixed Line Customer',
    gender: 1,
    birthday: '1975-01-30',
    cid: '2380009999',
    status: 1,
    user_type: 1,          // fixed-line customer
    phone_number: '02-381-4455',
    email: 'fixed01@example.com',
    point: 1200,
    created_at: stamp(1200),
  },
];

/* ------------------------------------------------------------------ *
 * Locations
 * ------------------------------------------------------------------ */

const PROVINCES = [
  { location_pk: 1, location_code: '01', location_name: 'Capital' },
  { location_pk: 2, location_code: '02', location_name: 'North Province' },
  { location_pk: 3, location_code: '03', location_name: 'South Province' },
  { location_pk: 4, location_code: '04', location_name: 'East Province' },
  { location_pk: 5, location_code: '05', location_name: 'West Province' },
  { location_pk: 6, location_code: '06', location_name: 'Coastal Region' },
  { location_pk: 7, location_code: '07', location_name: 'Highland Region' },
];

/* ------------------------------------------------------------------ *
 * Service agencies
 *
 * `business` is read positionally by the client
 * (AGENCY_BUSINESS maps index -> OS / Repair / Insurance / Change), so it
 * must stay a 4-character string of '0'/'1'.
 * ------------------------------------------------------------------ */

const AGENCY_SUFFIX = ['Service Center', 'Care Point', 'Tech Hub', 'Repair Studio', 'Support Desk'];

const AGENCIES = [];
(function buildAgencies() {
  let pk = 1;
  for (const province of PROVINCES) {
    const count = int(3, 5);
    for (let i = 0; i < count; i += 1) {
      // At least one business line is always on; an agency offering
      // nothing would render as an empty tag row.
      let business = '';
      for (let b = 0; b < 4; b += 1) business += chance(55) ? '1' : '0';
      if (business === '0000') business = '1000';

      AGENCIES.push({
        agency_pk: pk,
        agency_name: province.location_name + ' ' + pick(AGENCY_SUFFIX) + ' #' + (i + 1),
        location_pk: province.location_pk,
        location_code: province.location_code,
        location_name: province.location_name,
        parent_location_code: province.location_code,
        address: int(1, 240) + ' ' + pick(['Main', 'Station', 'Market', 'Harbour', 'Garden']) + ' Street',
        phone_numbers: '19' + int(1, 9) + '-' + int(200, 999) + '-' + int(1000, 9999),
        business,
        agency_rating: int(30, 50) / 10,
        open_time: '09:00',
        close_time: pick(['17:00', '18:00', '19:00']),
        is_deleted: 0,
        created_at: stamp(int(30, 900)),
      });
      pk += 1;
    }
  }
})();

/* ------------------------------------------------------------------ *
 * Phone catalogue
 * ------------------------------------------------------------------ */

// The root category's name has to be the exact string productModel matches
// on (lang/en.js PRODUCT_CATEGORY_PHONE), or the web product query returns
// nothing.
const ROOT_CATEGORY = { category_pk: 1, category_name: 'Smart Phone', parent_pk: 0, position: 1 };

// Leaf category pks match constants/intro.js on the client (S-9 = 13,
// S-7 = 15, S-5 = 17). Anything else renders under no tab at all.
const CATEGORIES = [
  { category_pk: 13, category_name: 'S-9', parent_pk: ROOT_CATEGORY.category_pk, position: 1 },
  { category_pk: 15, category_name: 'S-7', parent_pk: ROOT_CATEGORY.category_pk, position: 2 },
  { category_pk: 17, category_name: 'S-5', parent_pk: ROOT_CATEGORY.category_pk, position: 3 },
];

const COLORS = ['Graphite', 'Silver', 'Midnight', 'Ocean', 'Sand'];
const STORAGES = ['64GB', '128GB', '256GB', '512GB'];

const PRODUCTS = [];
(function buildProducts() {
  let pk = 101;
  CATEGORIES.forEach((category, ci) => {
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const storage = STORAGES[i % STORAGES.length];
      const color = COLORS[i % COLORS.length];
      // -1 is the catalogue's "price on request" sentinel; the product
      // grid renders it as "--". Keep a couple so that path is covered.
      const price = i === count - 1 ? -1 : (2200 - ci * 500 + i * 120) * 1000;
      PRODUCTS.push({
        product_pk: pk,
        root_pk: ROOT_CATEGORY.category_pk,
        category_pk: category.category_pk,
        category_name: category.category_name,
        product_name: category.category_name + ' ' + storage + ' ' + color,
        model_name: category.category_name + '-' + storage.replace('GB', ''),
        price,
        image_url: 'uploads/products/' + category.category_name.toLowerCase() + '-' + (i + 1) + '.png',
        release_at: dateOnly(int(60, 800)),
        position: i + 1,
        is_deleted: 0,
        status: 1,
        created_at: stamp(int(60, 800)),
      });
      pk += 1;
    }
  });
})();

/* ---- product images: MAIN (0) drives the spec page hero, INTRO (1) the gallery ---- */

const PRODUCT_IMAGES = [];
(function buildProductImages() {
  let pk = 1;
  for (const product of PRODUCTS) {
    PRODUCT_IMAGES.push({
      table_pk: pk++,
      image_pk: pk,
      product_pk: product.product_pk,
      image_type: 0,
      image_url: product.image_url,
      position: 1,
      is_deleted: 0,
      status: 1,
    });
    for (let i = 1; i <= 4; i += 1) {
      PRODUCT_IMAGES.push({
        table_pk: pk++,
        image_pk: pk,
        product_pk: product.product_pk,
        image_type: 1,
        image_url: 'uploads/products/intro/' + product.product_pk + '-' + i + '.jpg',
        position: i,
        is_deleted: 0,
        status: 1,
      });
    }
  }
})();

/* ---- specs: spec_type 0 is the table the client renders ---- */

const SPEC_ROWS = [
  ['Display', '6.7" AMOLED, 2400 x 1080, 120Hz'],
  ['Processor', 'Octa-core 2.8GHz'],
  ['Memory', '8GB RAM'],
  ['Storage', 'expandable to 1TB'],
  ['Rear Camera', '50MP wide + 12MP ultrawide + 5MP macro'],
  ['Front Camera', '16MP'],
  ['Battery', '5000mAh, 33W fast charge'],
  ['Operating System', 'Vendor OS 5.1'],
  ['Network', '2G / 3G / 4G LTE'],
  ['SIM', 'Dual nano-SIM'],
  ['Connectivity', 'Wi-Fi 6, Bluetooth 5.2, GPS'],
  ['Dimensions', '163.2 x 75.6 x 8.3 mm'],
  ['Weight', '198 g'],
  ['Water Resistance', 'IP53'],
];

const PRODUCT_SPECS = [];
(function buildSpecs() {
  let pk = 1;
  for (const product of PRODUCTS) {
    SPEC_ROWS.forEach((row, idx) => {
      let value = row[1];
      if (row[0] === 'Storage') {
        const storage = product.product_name.split(' ')[1];
        value = storage + ', ' + row[1];
      }
      PRODUCT_SPECS.push({
        spec_pk: pk++,
        product_pk: product.product_pk,
        root_pk: product.root_pk,
        spec_key_pk: idx + 1,
        spec_name: row[0],
        spec_value: value,
        spec_type: 0,
        position: idx + 1,
        is_deleted: 0,
      });
    });
  }
})();

/* ---- accessories / service costs ---- */

const ACCESSORY_NAMES = [
  'Display Assembly', 'Battery Pack', 'Rear Cover', 'Charging Port',
  'Main Camera Module', 'Front Camera Module', 'Speaker Unit',
  'Vibration Motor', 'Side Button Flex', 'SIM Tray',
];

const ACCESSORIES = [];
(function buildAccessories() {
  let pk = 1;
  for (const product of PRODUCTS) {
    ACCESSORY_NAMES.forEach((name, idx) => {
      ACCESSORIES.push({
        accessory_pk: pk++,
        product_pk: product.product_pk,
        accessory_name: name,
        resource_price: int(15, 320) + int(0, 99) / 100,
        service_price: int(5, 60) + int(0, 99) / 100,
        allow_num: String(int(1, 3)),
        position: idx + 1,
        is_deleted: 0,
        created_at: stamp(int(30, 600)),
      });
    });
  }
})();

/* ---- OS changelog ---- */

const CHANGELOGS = [];
(function buildChangelogs() {
  let pk = 1;
  for (const product of PRODUCTS) {
    const releases = int(3, 6);
    for (let i = releases; i >= 1; i -= 1) {
      CHANGELOGS.push({
        table_pk: pk++,
        changelog_pk: pk,
        product_pk: product.product_pk,
        title: 'Vendor OS 5.' + i + ' for ' + product.product_name,
        content:
          'Security patches rolled up to ' + dateOnly(i * 45) + '.\n' +
          'Camera night mode noise reduction improved.\n' +
          'Battery drain during standby reduced by roughly ' + int(4, 12) + '%.\n' +
          'Fixed a crash when switching SIM slots while on a call.',
        publish_num: 'B' + (2000 + i * 13) + '.' + int(10, 99),
        publish_at: stamp(i * 45),
        position: i,
        is_deleted: 0,
        created_at: stamp(i * 45),
      });
    }
  }
})();

/* ------------------------------------------------------------------ *
 * FAQs
 * ------------------------------------------------------------------ */

const FAQS = [
  ['How do I register my phone for warranty?',
   'Open Settings > About > Register, or bring the handset to any authorised service centre with the purchase receipt. Registration must be completed within 30 days of purchase.'],
  ['What does the standard warranty cover?',
   'Manufacturing defects for 12 months from the purchase date. Physical damage, liquid ingress and unauthorised repairs are not covered.'],
  ['How long does a screen replacement take?',
   'Most service centres complete a display replacement the same day, provided the part is in stock. Allow 3 working days if the part has to be ordered.'],
  ['Can I transfer my warranty to another owner?',
   'Yes. Both parties should visit a service centre with identification so the registration can be reassigned.'],
  ['My handset will not power on. What should I check first?',
   'Charge for at least 30 minutes with the supplied adapter, then hold the power button for 15 seconds. If there is still no response, contact a service centre.'],
  ['How do I back up before a repair?',
   'Settings > System > Backup writes a full archive to an SD card or to your account. Service centres cannot guarantee data retention during a repair.'],
  ['Where can I check the status of my repair?',
   'The service centre issues a job number on drop-off. Quote it on the support line to get the current status.'],
  ['Is the battery user-replaceable?',
   'No. The battery is sealed. Replacement is a service-centre operation and is priced in the accessory table on each product page.'],
  ['How often are OS updates released?',
   'Security updates roughly every 45 days, feature updates twice a year. The changelog on each product page lists every build.'],
  ['What should I do if I forget my account password?',
   'Use "Forgot password" on the sign-in screen. A verification code is sent to the registered phone number.'],
  ['Does the phone support memory card expansion?',
   'Yes, up to 1TB via the microSD slot in the SIM tray.'],
  ['How do I find my IMEI?',
   'Dial *#06#, or check Settings > About > Status. It is also printed on the retail box.'],
];

const FAQ_ROWS = FAQS.map((row, idx) => ({
  faq_pk: idx + 1,
  message_pk: idx + 1,
  category: 0,
  question: row[0],
  answer: row[1],
  position: idx + 1,
  visit_count: int(120, 9800),
  is_deleted: 0,
  created_at: stamp(int(10, 500)),
  updated_at: stamp(int(1, 9)),
}));

/* ------------------------------------------------------------------ *
 * Blog
 * ------------------------------------------------------------------ */

const BLOG_SUBJECTS = [
  { subject_id: 1, subject_name: 'Product News' },
  { subject_id: 2, subject_name: 'Tips & Tricks' },
  { subject_id: 3, subject_name: 'Repair Stories' },
  { subject_id: 4, subject_name: 'Software' },
  { subject_id: 5, subject_name: 'Community' },
];

const BLOG_TITLES = [
  'Two weeks with the S-9: what actually changed',
  'Getting a full day of battery out of a mid-range handset',
  'Why my screen replacement took 20 minutes, not 3 days',
  'Vendor OS 5.1: the settings worth turning on first',
  'Photo comparison: S-9 night mode against last year',
  'A field guide to the service centre queue',
  'How I recovered a phone that would not boot',
  'Dual SIM without the battery penalty',
  'The accessory prices nobody reads until they need them',
  'Six months on the S-5, one drop, no cracks',
  'Reading the changelog: what "security rollup" means',
  'Backing up before a repair, properly',
  'What the IP53 rating really promises',
  'Trading up: moving an account to a new handset',
  'Community round-up: this month in the forum',
];

const BLOG_ARTICLES = [];
(function buildBlogArticles() {
  BLOG_TITLES.forEach((title, idx) => {
    const subject = BLOG_SUBJECTS[idx % BLOG_SUBJECTS.length];
    const author = USERS[idx % USERS.length];
    BLOG_ARTICLES.push({
      id: idx + 1,
      blog_pk: idx + 1,
      parent_pk: 0,
      title,
      summary:
        'A first-hand write-up covering setup, day-to-day use and the parts of ' +
        'the experience that only show up after a few weeks of living with it.',
      content:
        '<p>' + title + '</p>' +
        '<p>This is fixture content. It stands in for a full article body so ' +
        'the reader, the reply list and the pagination controls all have ' +
        'something realistic to lay out.</p>' +
        '<p>The second paragraph exists so line clamping and "read more" ' +
        'behaviour can be checked against more than a single line.</p>',
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      user_pk: author.user_pk,
      user_userid: author.user_id,
      user_name: author.user_name,
      type: 0,
      state: 2,                       // PUB_APPROVED
      is_admin_recom: idx < 4 ? 1 : 0,
      thumb_gold: int(0, 40),
      thumb_silver: int(0, 120),
      thumb_bronze: int(0, 300),
      thumb_count: int(20, 460),
      visit_count: int(200, 24000),
      visited_num: int(200, 24000),
      reply_count: int(0, 38),
      reply_num: int(0, 38),
      publish_at: stamp(idx * 3 + 1, 10, 30),
      created_at: stamp(idx * 3 + 2, 9, 15),
      updated_at: stamp(idx * 3, 14, 5),
    });
  });
})();

const BLOG_REPLIES = [];
(function buildBlogReplies() {
  let pk = 1000;
  for (const article of BLOG_ARTICLES) {
    const count = Math.min(article.reply_count, 8);
    for (let i = 0; i < count; i += 1) {
      const author = USERS[(article.id + i) % USERS.length];
      BLOG_REPLIES.push({
        id: pk,
        blog_pk: pk,
        parent_pk: article.id,
        title: 'Re: ' + article.title,
        summary: 'A reply on the thread.',
        content:
          '<p>Reply ' + (i + 1) + ' on "' + article.title + '". ' +
          'Fixture text long enough to wrap over a couple of lines in the ' +
          'reply card.</p>',
        subject_id: article.subject_id,
        subject_name: article.subject_name,
        user_pk: author.user_pk,
        user_userid: author.user_id,
        user_name: author.user_name,
        state: 2,
        thumb_gold: int(0, 6),
        thumb_silver: int(0, 20),
        thumb_bronze: int(0, 40),
        visit_count: int(5, 400),
        reply_count: 0,
        publish_at: stamp(article.id * 3 - i * 0.2 + 0.5 | 0, 12, i * 7),
        created_at: stamp(article.id * 3 - i * 0.2 + 0.5 | 0, 12, i * 7),
      });
      pk += 1;
    }
  }
})();

const HONORMANS = USERS.map((user, idx) => ({
  user_pk: user.user_pk,
  user_userid: user.user_id,
  user_name: user.user_name,
  rank: idx + 1,
  article_count: int(4, 40),
  thumb_gold: int(2, 30),
  thumb_silver: int(10, 90),
  thumb_bronze: int(20, 200),
  total_point: int(1000, 90000),
}));

/* ------------------------------------------------------------------ *
 * Account area - one dataset per user_pk
 * ------------------------------------------------------------------ */

const GOODS = [
  'Wireless Earbuds', 'Fast Charger 33W', 'Protective Case', 'Tempered Glass',
  'Power Bank 10000mAh', 'USB-C Cable 1m', 'Car Mount', 'Bluetooth Speaker',
];

const APPS = [
  'Weather Now', 'Photo Studio', 'Note Keeper', 'Fitness Track',
  'Music Box', 'Translate Pro', 'File Manager', 'Puzzle Quest',
];

/** Build a per-user block so two accounts never show identical history. */
function buildAccountData(user) {
  const uid = user.user_pk;

  const eshopOrders = [];
  for (let i = 0; i < 23; i += 1) {
    const foreign_qty = chance(50) ? int(1, 3) : 0;
    const native_qty = chance(60) ? int(1, 5) : 0;
    const point_qty = chance(30) ? int(1, 2) : 0;
    const status = pick([0, 1, 2, 3]);
    eshopOrders.push({
      id: uid * 1000 + i + 1,
      order_pk: uid * 1000 + i + 1,
      user_pk: uid,
      order_no: 'ORD-' + (uid * 1000 + i + 1),
      status,
      // The list renders these three quantity/price pairs side by side.
      foreign_qty,
      foreign_price: foreign_qty * int(20, 180) * 1000,
      native_qty,
      native_price: native_qty * int(5, 60) * 1000,
      point_qty,
      point_price: point_qty * int(100, 900),
      goods_name: pick(GOODS),
      address: pick(PROVINCES).location_name + ', ' + int(1, 200) + ' Market Street',
      building: 'Building ' + pick(['A', 'B', 'C']) + ', Apt ' + int(101, 920),
      contact: user.user_name + ' / ' + user.phone_number,
      user_reason: status === 2 ? 'Ordered the wrong colour' : '',
      reason: status === 3 ? 'Out of stock at the fulfilment centre' : '',
      created_at: stamp(i * 5 + 1, 11, 20),
      updated_at: stamp(i * 5, 16, 40),
    });
  }

  const eshopOrderDetails = {};
  for (const order of eshopOrders) {
    const lines = int(1, 4);
    const rows = [];
    for (let i = 0; i < lines; i += 1) {
      const qty = int(1, 3);
      const price = int(8, 220) * 1000;
      rows.push({
        id: order.id * 10 + i,
        detail_pk: order.id * 10 + i,
        order_pk: order.id,
        goods_name: pick(GOODS),
        goods_option: pick(COLORS),
        qty,
        price,
        total_price: qty * price,
        money_type: pick([0, 3, 4]),
      });
    }
    eshopOrderDetails[order.id] = rows;
  }

  const eshopWallet = [];
  for (let i = 0; i < 31; i += 1) {
    eshopWallet.push({
      id: uid * 2000 + i + 1,
      user_pk: uid,
      money: (chance(50) ? 1 : -1) * int(2, 90) * 1000,
      money_type: pick([0, 3, 4]),
      fill_type: pick([0, 1, 2]),
      detail: pick([
        'Order payment', 'Wallet top-up', 'Refund for cancelled order',
        'Promotion credit', 'Points converted to wallet',
      ]),
      created_at: stamp(i * 3 + 1, 9, 5),
    });
  }

  const eshopExpLog = [];
  for (let i = 0; i < 18; i += 1) {
    eshopExpLog.push({
      id: uid * 2100 + i + 1,
      user_pk: uid,
      exp: int(5, 250),
      total_exp: 1000 + i * 130,
      level: Math.min(5, 1 + Math.floor(i / 4)),
      detail: pick(['Order completed', 'Review posted', 'Daily check-in', 'Referral bonus']),
      created_at: stamp(i * 6 + 2, 13, 10),
    });
  }

  const eshopCommerceValues = [];
  for (let i = 0; i < 14; i += 1) {
    eshopCommerceValues.push({
      id: uid * 2200 + i + 1,
      user_pk: uid,
      commerce_value: int(50, 4000),
      total_value: 5000 + i * 420,
      detail: pick(['Monthly settlement', 'Order value credited', 'Adjustment']),
      created_at: stamp(i * 9 + 3, 15, 45),
    });
  }

  const appstorePurchases = [];
  for (let i = 0; i < 27; i += 1) {
    const purchasable_type = pick(['appversion', 'diamond', 'eventitem', 'nickname', 'avatar']);
    const spd_state_id = pick([1, 2, 3]);
    appstorePurchases.push({
      purchase_history_unique_id: 'PH-' + uid + '-' + (i + 1),
      user_pk: uid,
      purchasable_type,
      purchasable_id: 500 + i,
      app_name: purchasable_type === 'appversion' ? pick(APPS) : '',
      diamond_name: purchasable_type === 'diamond' ? int(60, 1200) + ' Diamonds' : '',
      eventitem_title: purchasable_type === 'eventitem' ? 'Summer Event Pack' : '',
      nickname_name: purchasable_type === 'nickname' ? 'Nickname change' : '',
      device_no: 'DEV-' + int(100000, 999999),
      purchasemoney_type: pick([0, 1]),
      purchase_actual_value: int(100, 30000),
      spd_state_id,
      spd_change_reason: spd_state_id === 3 ? 'Payment declined' : '',
      created_at: stamp(i * 4 + 1, 10, 0),
    });
  }

  const appstoreComments = [];
  for (let i = 0; i < 16; i += 1) {
    appstoreComments.push({
      comment_pk: uid * 2300 + i + 1,
      user_pk: uid,
      app_id: 500 + i,
      app_name: pick(APPS),
      rating: int(1, 5),
      content: pick([
        'Works well, no complaints after a month of daily use.',
        'Solid, but the sync could be faster on mobile data.',
        'Crashed on launch until the latest update fixed it.',
        'Exactly what I needed. Simple and quick.',
      ]),
      like_count: int(0, 60),
      created_at: stamp(i * 7 + 2, 20, 15),
    });
  }

  const appstoreFavorites = [];
  for (let i = 0; i < 12; i += 1) {
    appstoreFavorites.push({
      favorite_pk: uid * 2400 + i + 1,
      user_pk: uid,
      app_id: 500 + i,
      app_name: APPS[i % APPS.length],
      category_name: pick(['Tools', 'Photo', 'Games', 'Lifestyle']),
      download_count: int(1000, 900000),
      rating: int(30, 50) / 10,
      created_at: stamp(i * 11 + 4, 18, 30),
    });
  }

  const appstoreWallet = [];
  for (let i = 0; i < 22; i += 1) {
    appstoreWallet.push({
      transaction_pk: uid * 2500 + i + 1,
      user_pk: uid,
      transaction_type: pick([0, 1, 2]),
      money_type: pick([0, 1]),
      amount: (chance(45) ? 1 : -1) * int(50, 5000),
      balance: int(1000, 90000),
      detail: pick(['App purchase', 'Wallet charge', 'Transfer received', 'Transfer sent']),
      created_at: stamp(i * 5 + 1, 12, 25),
    });
  }

  /** Point logs share a shape across the four software categories. */
  const pointLog = (seedOffset, labels) => {
    const rows = [];
    for (let i = 0; i < 19; i += 1) {
      rows.push({
        point_pk: uid * seedOffset + i + 1,
        user_pk: uid,
        point: (chance(70) ? 1 : -1) * int(10, 900),
        total_point: 5000 + i * 210,
        point_type: int(0, 4),
        status: pick([0, 1]),
        detail: labels[i % labels.length],
        created_at: stamp(i * 6 + 1, 8, 40),
      });
    }
    return rows;
  };

  const keygenLog = (prefix, seedOffset) => {
    const rows = [];
    for (let i = 0; i < 17; i += 1) {
      rows.push({
        keygen_pk: uid * seedOffset + i + 1,
        id: uid * seedOffset + i + 1,
        user_pk: uid,
        serial_no: prefix + '-' + int(100000, 999999),
        device_no: 'DEV-' + int(100000, 999999),
        product_name: pick(APPS),
        provider_name: pick(['Central Media', 'Northern Studio', 'Coastal Records']),
        point: int(50, 2000),
        status: pick([0, 1]),
        created_at: stamp(i * 8 + 2, 17, 55),
      });
    }
    return rows;
  };

  const eprodRegisterLog = [];
  for (let i = 0; i < 15; i += 1) {
    eprodRegisterLog.push({
      register_pk: uid * 2600 + i + 1,
      user_pk: uid,
      phone_imei: '35' + int(1000000000000, 9999999999999),
      product_name: pick(PRODUCTS).product_name,
      point: int(100, 3000),
      status: pick([0, 1, 2]),
      register_source: pick([0, 1]),
      created_at: stamp(i * 12 + 3, 11, 5),
    });
  }

  const feedbackThreads = [];
  for (let i = 0; i < 11; i += 1) {
    feedbackThreads.push({
      thread_pk: uid * 2700 + i + 1,
      user_pk: uid,
      category: int(0, 3),
      status: int(0, 2),
      title: pick([
        'Screen flickers after the 5.1 update',
        'Order never arrived',
        'Wallet balance is wrong',
        'Cannot register my IMEI',
        'Suggestion: dark mode for the store',
      ]),
      last_message: pick([
        'Thanks for the report - we have escalated this to the service team.',
        'Could you send the job number from your drop-off receipt?',
        'This has been resolved in build B2039.',
        'We have credited the difference back to your wallet.',
      ]),
      message_count: int(1, 9),
      created_at: stamp(i * 14 + 5, 10, 20),
      updated_at: stamp(i * 14, 16, 50),
    });
  }

  const feedbackMessages = {};
  for (const thread of feedbackThreads) {
    const rows = [];
    const count = Math.min(thread.message_count, 6);
    for (let i = 0; i < count; i += 1) {
      const fromUser = i % 2 === 0;
      rows.push({
        message_pk: thread.thread_pk * 10 + i,
        thread_pk: thread.thread_pk,
        user_pk: fromUser ? uid : null,
        action_type: fromUser ? 0 : 1,
        writer_name: fromUser ? user.user_name : 'Support Agent',
        message: fromUser
          ? 'Message ' + (i + 1) + ' from the customer describing the issue in more detail.'
          : 'Message ' + (i + 1) + ' from support with the next step.',
        created_at: stamp(thread.thread_pk % 30 + 5 - i * 0.5 | 0, 10 + i, 15),
      });
    }
    feedbackMessages[thread.thread_pk] = rows;
  }

  const myArticles = BLOG_ARTICLES
    .filter((article) => article.user_pk === uid)
    .map((article) => Object.assign({}, article));

  const myDrafts = [];
  for (let i = 0; i < 5; i += 1) {
    myDrafts.push({
      id: uid * 2800 + i + 1,
      blog_pk: uid * 2800 + i + 1,
      parent_pk: 0,
      title: 'Draft: ' + BLOG_TITLES[(uid + i) % BLOG_TITLES.length],
      summary: 'Unpublished draft kept in the account area.',
      content: '<p>Draft body, not yet submitted for approval.</p>',
      subject_id: BLOG_SUBJECTS[i % BLOG_SUBJECTS.length].subject_id,
      subject_name: BLOG_SUBJECTS[i % BLOG_SUBJECTS.length].subject_name,
      user_pk: uid,
      user_userid: user.user_id,
      state: 0,                    // draft
      thumb_gold: 0,
      thumb_silver: 0,
      thumb_bronze: 0,
      visit_count: 0,
      reply_count: 0,
      publish_at: null,
      created_at: stamp(i * 9 + 1, 21, 30),
      updated_at: stamp(i * 9, 21, 45),
    });
  }

  return {
    eshopOrders,
    eshopOrderDetails,
    eshopWallet,
    eshopExpLog,
    eshopCommerceValues,
    eshopBalance: {
      accum_money: int(10, 400) * 1000,
      wallet_money: int(5, 250) * 1000,
      bonus_money: int(1, 60) * 1000,
      exp: 1000 + uid % 900,
      level: (uid % 5) + 1,
      commerce_value: int(1000, 40000),
    },
    appstorePurchases,
    appstoreComments,
    appstoreFavorites,
    appstoreWallet,
    appstorePointLog: pointLog(2900, ['App purchase reward', 'Review bonus', 'Daily login', 'Refund adjustment']),
    karaokePointLog: pointLog(3000, ['Song pack unlocked', 'Weekly ranking bonus', 'Point expiry']),
    bmediaPointLog: pointLog(3100, ['Media licence issued', 'Provider bonus', 'Point correction']),
    minusPointLog: pointLog(3200, ['Penalty: duplicate registration', 'Manual deduction', 'Chargeback']),
    activityPointLog: pointLog(3300, ['Event participation', 'Survey completed', 'Referral reward']),
    activityOldLog: pointLog(3400, ['Legacy event credit', 'Migrated balance']),
    karaokeOldLog: pointLog(3500, ['Legacy karaoke credit', 'Migrated licence']),
    bmediaOldLog: pointLog(3600, ['Legacy media credit', 'Migrated licence']),
    karaokeKeygenLog: keygenLog('KAR', 3700),
    manbangKeygenLog: keygenLog('MB', 3800),
    bmediaKeygenLog: keygenLog('BM', 3900),
    eprodRegisterLog,
    feedbackThreads,
    feedbackMessages,
    myArticles,
    myDrafts,
  };
}

const ACCOUNTS = {};
for (const user of USERS) {
  ACCOUNTS[user.user_pk] = buildAccountData(user);
}

const BMEDIA_PROVIDERS = [
  { provider_pk: 1, provider_name: 'Central Media', contact: '191-300-1000' },
  { provider_pk: 2, provider_name: 'Northern Studio', contact: '192-410-2200' },
  { provider_pk: 3, provider_name: 'Coastal Records', contact: '193-520-3300' },
];

module.exports = {
  NOW,
  stamp,
  dateOnly,
  USERS,
  PROVINCES,
  AGENCIES,
  ROOT_CATEGORY,
  CATEGORIES,
  PRODUCTS,
  PRODUCT_IMAGES,
  PRODUCT_SPECS,
  ACCESSORIES,
  CHANGELOGS,
  FAQ_ROWS,
  BLOG_SUBJECTS,
  BLOG_ARTICLES,
  BLOG_REPLIES,
  HONORMANS,
  BMEDIA_PROVIDERS,
  ACCOUNTS,
};
