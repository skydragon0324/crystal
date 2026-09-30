/**
 * The support network: where repairs physically happen.
 *
 * Twelve centres across nine provinces, deliberately UNEVEN - different
 * tiers, different SLAs, different capacities.  An estate where every centre
 * is identical makes the health board in section 9 of the schema produce
 * twelve identical rows, which proves the query runs and nothing else.
 */

/* name, code, province, code, city, tier, sla hours, capacity, lat, lng */
/**
 * THE SERVICE NETWORK, generated rather than typed out.
 *
 * A dozen hand-written rows could not exercise the thing the locator is for:
 * a list nobody can read at a glance, which is why it has a province filter,
 * a search box and paging. Twelve rows fit on one screen and prove none of
 * it works.
 *
 * So the provinces are real, the cities in them are real, and the branches
 * are laid out across them the way a network actually grows - a flagship in
 * the biggest city of each province, authorised centres in the others, and
 * collection points in the smaller ones. That gives a spread of tiers rather
 * than a hundred identical rows.
 *
 * THE ORDER OF THIS LIST IS THE PROVINCE ORDER the storefront's filter shows
 * (provinces.sort_order, in steps of ten) - the two largest networks first,
 * then roughly by size. Not the alphabet, which is exactly what the Provinces
 * screen exists to get away from.
 */
const PROVINCES = [
  ['Shanghai',  'SH', ['Huangpu', 'Pudong', 'Xuhui', 'Jingan', 'Hongkou', 'Minhang']],
  ['Beijing',   'BJ', ['Dongcheng', 'Haidian', 'Chaoyang', 'Fengtai', 'Shijingshan']],
  ['Guangdong', 'GD', ['Guangzhou', 'Shenzhen', 'Dongguan', 'Foshan', 'Zhuhai', 'Shantou', 'Huizhou']],
  ['Zhejiang',  'ZJ', ['Hangzhou', 'Ningbo', 'Wenzhou', 'Jiaxing', 'Shaoxing']],
  ['Jiangsu',   'JS', ['Nanjing', 'Suzhou', 'Wuxi', 'Changzhou', 'Nantong', 'Xuzhou']],
  ['Sichuan',   'SC', ['Chengdu', 'Mianyang', 'Leshan', 'Luzhou', 'Deyang', 'Nanchong']],
  ['Hubei',     'HB', ['Wuhan', 'Yichang', 'Xiangyang', 'Jingzhou', 'Huangshi']],
  ['Shaanxi',   'SN', ['Xian', 'Baoji', 'Xianyang', 'Weinan']],
  ['Liaoning',  'LN', ['Shenyang', 'Dalian', 'Anshan', 'Fushun', 'Jinzhou']],
  ['Yunnan',    'YN', ['Kunming', 'Dali', 'Lijiang', 'Qujing']],
  ['Shandong',  'SD', ['Jinan', 'Qingdao', 'Yantai', 'Weifang', 'Zibo', 'Jining']],
  ['Fujian',    'FJ', ['Fuzhou', 'Xiamen', 'Quanzhou', 'Zhangzhou', 'Putian']],
  ['Hunan',     'HN', ['Changsha', 'Zhuzhou', 'Hengyang', 'Yueyang', 'Changde']],
  ['Henan',     'HA', ['Zhengzhou', 'Luoyang', 'Kaifeng', 'Xinxiang', 'Anyang']],
  ['Hebei',     'HE', ['Shijiazhuang', 'Tangshan', 'Baoding', 'Handan', 'Langfang']],
  ['Anhui',     'AH', ['Hefei', 'Wuhu', 'Bengbu', 'Anqing']],
  ['Jiangxi',   'JX', ['Nanchang', 'Ganzhou', 'Jiujiang', 'Yichun']],
  ['Guangxi',   'GX', ['Nanning', 'Guilin', 'Liuzhou', 'Beihai']],
  ['Chongqing', 'CQ', ['Yuzhong', 'Jiangbei', 'Shapingba']],
  ['Tianjin',   'TJ', ['Heping', 'Nankai', 'Binhai', 'Hexi']],
  ['Heilongjiang', 'HL', ['Harbin', 'Daqing', 'Qiqihar']],
  ['Jilin',     'JL', ['Changchun', 'Jilin City', 'Siping']],
  ['Guizhou',   'GZ', ['Guiyang', 'Zunyi']]
];

/**
 * A centre per city, with the tier decided by where the city sits in its
 * province.
 *
 *   the first city  a flagship, or a factory service in the two largest
 *   the next few    authorised centres
 *   the rest        collection points
 *
 * The SLA and the daily capacity follow the tier, because a collection point
 * three provinces from a workshop cannot honestly promise what a flagship
 * can - which is the whole reason those columns are per centre.
 */
const AGENCIES = [];

PROVINCES.forEach(function (entry, provinceIndex) {
  const [province, code, cities] = entry;

  cities.forEach(function (city, cityIndex) {
    let tier = 0;
    if (cityIndex === 0) tier = provinceIndex < 2 ? 3 : 2;
    else if (cityIndex < 3) tier = 1;

    const sla = [120, 96, 48, 36][tier];
    const capacity = [8, 18, 40, 60][tier];
    const suffix = ['Collection Point', 'Service Centre', 'Flagship Service', 'Factory Service'][tier];

    AGENCIES.push([
      city + ' ' + suffix,
      code + String(cityIndex + 1).padStart(2, '0'),
      province,
      code,
      city,
      tier,
      sla,
      capacity
    ]);
  });
});

/**
 * The building nearby, for the staff who have to find a centre - CONSOLE ONLY.
 *
 * Every centre at tier 1 and up has one; a collection point is left without,
 * so the console shows both states and the storefront check has a centre
 * with nothing to leak as well as a hundred with something.
 */
const LANDMARKS = [
  'Opposite {city} Railway Station, beside the taxi rank',
  'Ground floor of {city} Wanda Plaza, next to the cinema entrance',
  'Behind the {city} Central Post Office',
  'Across from {city} People\'s Park, at metro exit B',
  'Next to the {city} Grand Theatre box office',
  'Inside the {city} Digital Mall, third floor by the lifts'
];

/**
 * What each tier is allowed to attempt, PER SECTION.
 *
 * The two vocabularies are fixed and different - see
 * services/agencies.service.js, which rejects anything outside them. A
 * collection point takes repairs and nothing else; a flagship runs the
 * whole counter.
 *
 * Not every centre does both sections, deliberately: the eproduct list is
 * only given to tier 1 and up, so the storefront and the console both have
 * centres that appear on one section page and not the other. A seed where
 * every row offered everything would not exercise the split at all.
 */
const SERVICES_BY_TIER = {
  SMARTPHONE: {
    0: ['REPAIR'],
    1: ['REPAIR', 'OS'],
    2: ['REPAIR', 'OS', 'REPLACEMENT', 'INSURANCE'],
    3: ['REPAIR', 'OS', 'REPLACEMENT', 'INSURANCE']
  },
  EPRODUCT: {
    0: [],
    1: ['REPAIR', 'COMPUTER'],
    2: ['REPAIR', 'COMPUTER', 'MEDIA_SERVICE', 'STREAMING_DEVICES'],
    3: ['REPAIR', 'COMPUTER', 'MEDIA_SERVICE', 'STREAMING_DEVICES',
      'CORDLESS_PHONE', 'CAMERA_DEVICE']
  }
};

/**
 * THE PUBLISHED QUESTIONS.
 *
 * FILED BY WHAT THEY ARE ABOUT, not by topic. `faqs.category` is the product
 * kind in the visitor's hands - SMARTPHONE, TV, STB, COMPUTER, CAMERA - or
 * one of the Crystal services that are not products: CRYSTAL_APP, ESHOP,
 * APPSTORE. See sql/deltas/033.
 *
 * The topic - warranty, repair, the OS - is still there, in the wording of
 * the question, which is where a reader was reading it from anyway.
 *
 * The first block is hand written: those are the questions with answers
 * somebody actually thought about, and they are what the "popular problems"
 * band on the support page shows. The rest are generated across the product
 * lines, because a dozen questions fit on one screen and prove nothing about
 * the filter, the search or the paging that the page is built around.
 *
 *   [ category, question, answer ]
 */
const CORE_FAQS = [
  ['SMARTPHONE', 'How long is my Crystal device covered for?',
    'Smartphones in the C9 and C7 lines carry 24 months of cover; C5 and C3 carry 12. Register the device in your account and the exact end date is shown on its card. Cover starts from the purchase date when you supply one, and from the registration date otherwise.'],
  ['SMARTPHONE', 'What is not covered?',
    'Accidental damage, liquid ingress and cosmetic wear are not covered by the standard warranty. Crystal Care+ adds accidental damage cover with a limit on how many claims can be made.'],
  ['SMARTPHONE', 'Can I extend my warranty?',
    'Yes. An extension can be bought from your account at any time while the device is still covered, and it starts the day after your current cover ends rather than today - so renewing early never costs you the days you already paid for.'],
  ['SMARTPHONE', 'How long will my repair take?',
    'Each service centre publishes its own promised turnaround, between 36 and 120 hours depending on the centre. Your ticket shows the exact date and time it was promised for when you booked it in.'],
  ['SMARTPHONE', 'How do I track my repair?',
    'Use the ticket number on your receipt on the support page. You will see the current stage and every update the centre has published.'],
  ['SMARTPHONE', 'The same fault has come back. What now?',
    'Bring it in again and quote the previous ticket number. A device returning within 30 days is automatically linked to its previous repair, and repeat repairs are reviewed by the centre manager.'],
  ['SMARTPHONE', 'Do you use original parts?',
    'Every part fitted at an authorised centre comes from Crystal stock and carries its own warranty from the day it is fitted.'],
  ['SMARTPHONE', 'How do I update Crystal OS?',
    'Settings, then System, then Software update. Any authorised centre will also do it while you wait.'],
  ['SMARTPHONE', 'My device did not get the latest version.',
    'Versions reach different products at different times. The OS History tab on your product page lists exactly which versions have reached it and when.'],
  ['SMARTPHONE', 'Is my warranty transferable?',
    'Standard cover follows the device rather than the owner, so a second hand device keeps whatever cover it has left.'],

  ['TV', 'My television will not turn on. What should I check first?',
    'Try a different wall socket and a different power lead before anything else - a failed lead looks exactly like a failed set and is the fault we see most. If the standby light does not come on at all, bring it to a centre that lists Media service.'],
  ['TV', 'Which centres repair televisions and set-top boxes?',
    'The eproduct list under Support, Service centres. It is a different list from the smartphone one on purpose: the same building often runs two counters, and only some of them handle large screens.'],
  ['TV', 'Can you collect a large television for repair?',
    'A centre at flagship tier or above arranges collection for screens over 65 inches. Smaller sets are walk-in, and every centre takes those.'],

  ['ESHOP', 'Where do I buy accessories and parts?',
    'The Crystal Eshop is a separate system - the link in the header takes you there. Service centres also stock the common parts for walk-in repairs.'],
  ['ESHOP', 'My Eshop order has not arrived.',
    'Orders are tracked in the Eshop itself rather than here, under Orders in your Eshop account. Delivery is free on every order, and the tracking reference is on the confirmation email.'],
  ['ESHOP', 'Can I pay for an Eshop order with points?',
    'Points buy device licences and warranty extensions rather than hardware. Your point balance and the full ledger behind it are in your account under Points.'],

  ['APPSTORE', 'An app I bought is missing after a repair.',
    'Purchases follow your Crystal account rather than the device, so signing in on the repaired device restores them. Open the Appstore, sign in, and the Purchases list will re-download them.'],
  ['APPSTORE', 'How do I get a refund for an app?',
    'Refunds are handled by the Appstore, which is a separate system - the link in the header takes you there. Your purchase history is under Purchases in your Appstore account.'],

  ['CRYSTAL_APP', 'How do I sign in on my phone?',
    'Mobile sign-in uses your phone number and a verification code rather than a password. Desktop sign-in uses your email and password. A tablet can use either.'],
  ['CRYSTAL_APP', 'What are points for?',
    'Registering a device earns points, and signing in earns a smaller number once a day. Points can be spent on device licences and on warranty extensions.'],
  ['CRYSTAL_APP', 'How do I register a device I bought second hand?',
    'A serial number can only be registered to one account. Ask the previous owner to remove it from theirs, then register it on yours.'],
  ['CRYSTAL_APP', 'I have forgotten the password on my wallet.',
    'The pay password is separate from your sign-in password, deliberately - a borrowed session should not be able to empty a wallet. Reset it under Settings, Security, using the sign-in password you still have.']
];

/**
 * The product lines the generated questions are spread across.
 *
 *   [ name, category ]
 *
 * The category comes from the LINE rather than from the question, which is
 * the whole point of filing by product: "how long does a repair take" is a
 * smartphone question about a handset and a TV question about a television,
 * and it is the same sentence either way.
 */
const FAQ_LINES = [
  ['C9 Pro', 'SMARTPHONE'],
  ['C9', 'SMARTPHONE'],
  ['C7 Pro', 'SMARTPHONE'],
  ['C7', 'SMARTPHONE'],
  ['C5', 'SMARTPHONE'],
  ['C3', 'SMARTPHONE'],
  ['Vision 85 QLED', 'TV'],
  ['Vision 55', 'TV'],
  ['Link 4K', 'STB'],
  ['Studio 16', 'COMPUTER'],
  ['Optic R1', 'CAMERA']
];

/**
 * The questions asked of every line.
 *
 * The first element OVERRIDES the line's category, and is only set where the
 * answer genuinely belongs to another system: buying an accessory is an Eshop
 * question whichever product prompted it.
 */
const FAQ_SHAPES = [
  [null, 'How long is the {line} covered for?',
    'The {line} carries the standard warranty for its line, counted from the purchase date. Register it to your account and the exact end date is shown on its card - the date comes from our records rather than from a receipt you have to keep.'],
  [null, 'What does a screen repair cost on the {line}?',
    'Every repairable part on the {line} is published with its price before you need it, under Support then Repair pricing. The part and the labour are listed separately, so you can see which half you could avoid by supplying your own part.'],
  [null, 'How long does a {line} repair take?',
    'Most repairs are done the same day at a flagship centre and within the promised turnaround everywhere else - each centre publishes its own, because a collection point three provinces from a workshop cannot honestly promise what a flagship can.'],
  [null, 'Will the {line} get the next Crystal OS?',
    'Every model launched with Crystal OS 5.0 or later gets five years of security updates. Rollouts are staged, so the Software updates tab on the {line} page lists exactly which versions have reached it and when.'],
  ['CRYSTAL_APP', 'How do I register my {line}?',
    'Sign in, open Register a product, and enter the serial number from the box or from Settings then About on the device. It takes about thirty seconds, records your warranty date, and earns 500 points.'],
  ['ESHOP', 'Where can I buy accessories for the {line}?',
    'Accessories and spare parts are sold on the Crystal Eshop, which is a separate system - the link in the header takes you there. Service centres also stock the common parts for walk-in repairs.'],
  [null, 'Is accidental damage covered on the {line}?',
    'No. The standard warranty covers manufacturing defects; accidental damage, liquid ingress and cosmetic wear are not included. Crystal Care+ adds accidental damage cover with a limit on how many claims can be made.'],
  [null, 'Do I need an appointment to bring in a {line}?',
    'No. Every service centre takes walk-ins. Bring the device and, if you have it, the account it is registered to - that is what lets the counter see your warranty date without a receipt.']
];

const FAQS = CORE_FAQS.slice();

FAQ_LINES.forEach(function (entry) {
  const [line, kind] = entry;

  FAQ_SHAPES.forEach(function (shape) {
    FAQS.push([
      shape[0] || kind,
      shape[1].split('{line}').join(line),
      shape[2].split('{line}').join(line)
    ]);
  });
});

/**
 * The published repair price list.
 *
 * Priced from the product rather than typed per product: a screen on a
 * flagship costs more than a screen on an entry handset, and writing that out
 * nineteen times is nineteen chances to get one wrong.  `part` names the
 * stock item the line consumes, which seed 04 links up once the parts exist.
 */
const PRICE_LINES = [
  ['Screen replacement', 'SCREEN', 0.22, 45, 90, 1],
  ['Battery replacement', 'BATTERY', 0.06, 25, 45, 1],
  ['Charging port repair', 'PORT', 0.04, 20, 40, 2],
  ['Rear camera module', 'CAMERA', 0.12, 30, 60, 1],
  ['Front camera module', null, 0.05, 25, 45, 1],
  ['Speaker replacement', 'SPEAKER', 0.03, 18, 30, 2],
  ['Earpiece replacement', null, 0.02, 16, 30, 2],
  ['Rear glass replacement', 'BACKGLASS', 0.07, 22, 45, 1],
  ['Frame straightening', null, 0.05, 40, 90, 1],
  ['Motherboard repair', 'BOARD', 0.35, 80, 180, 1],
  ['Fingerprint sensor', null, 0.04, 24, 45, 1],
  ['Vibration motor', null, 0.02, 15, 25, 2],
  ['SIM tray replacement', null, 0.01, 10, 15, 2],
  ['Software recovery', null, 0, 15, 45, 0],
  ['Water damage treatment', null, 0, 55, 120, 1]
];

/**
 * The eproduct price lists, which are NOT the smartphone one.
 *
 * A television has no charging port and a set-top box has no screen, so a
 * shared list would publish prices for repairs that cannot happen. Keyed by
 * category type, and the section pages in the console are edited by
 * different people for the same reason.
 */
const EPRODUCT_PRICE_LINES = {
  TV: [
    ['Panel replacement', null, 0.45, 120, 240, 1],
    ['Backlight strip set', null, 0.08, 70, 150, 1],
    ['Main board repair', null, 0.18, 80, 120, 1],
    ['Power board replacement', null, 0.09, 55, 90, 1],
    ['T-CON board replacement', null, 0.07, 50, 75, 1],
    ['Speaker array', null, 0.05, 35, 60, 2],
    ['HDMI port repair', null, 0.03, 30, 60, 3],
    ['Wi-Fi module', null, 0.04, 28, 45, 1],
    ['Stand or bracket', null, 0.03, 20, 30, 2],
    ['Remote control replacement', null, 0.02, 10, 15, 3],
    ['Firmware recovery', null, 0, 25, 60, 0],
    ['Screen calibration', null, 0, 35, 60, 0]
  ],
  STB: [
    ['Main board repair', null, 0.30, 55, 90, 1],
    ['Power supply replacement', null, 0.12, 35, 45, 1],
    ['Tuner module', null, 0.15, 40, 60, 1],
    ['Storage replacement', null, 0.20, 45, 60, 1],
    ['HDMI port repair', null, 0.05, 28, 45, 3],
    ['Cooling fan', null, 0.04, 22, 30, 2],
    ['Remote control replacement', null, 0.03, 10, 15, 3],
    ['Firmware recovery', null, 0, 20, 45, 0],
    ['Channel reconfiguration', null, 0, 18, 30, 0],
    ['Card reader repair', null, 0.06, 25, 40, 1],
    ['Casing replacement', null, 0.05, 18, 25, 1]
  ],
  COMPUTER: [
    ['Display assembly', null, 0.28, 90, 150, 1],
    ['Keyboard replacement', null, 0.07, 45, 75, 1],
    ['Battery replacement', null, 0.09, 40, 60, 1],
    ['Storage upgrade or swap', null, 0.12, 40, 45, 2],
    ['Memory replacement', null, 0.10, 35, 40, 2],
    ['Main board repair', null, 0.38, 110, 210, 1],
    ['Cooling assembly clean', null, 0.03, 45, 90, 2],
    ['Hinge repair', null, 0.05, 50, 90, 1],
    ['Charging port repair', null, 0.04, 35, 60, 2],
    ['Speaker replacement', null, 0.03, 25, 40, 2],
    ['Operating system recovery', null, 0, 30, 90, 0],
    ['Data migration', null, 0, 45, 120, 0]
  ],
  CAMERA: [
    ['Lens module replacement', null, 0.30, 70, 120, 1],
    ['Image sensor replacement', null, 0.35, 90, 150, 1],
    ['IR illuminator set', null, 0.08, 35, 60, 1],
    ['Housing seal replacement', null, 0.05, 30, 45, 2],
    ['Mount or bracket', null, 0.03, 20, 30, 2],
    ['Power over Ethernet module', null, 0.09, 40, 60, 1],
    ['Storage card slot repair', null, 0.04, 25, 40, 2],
    ['Recorder drive replacement', null, 0.18, 55, 75, 2],
    ['Firmware recovery', null, 0, 22, 45, 0],
    ['Focus calibration', null, 0, 28, 45, 0],
    ['Night vision calibration', null, 0, 30, 50, 0]
  ]
};

exports.seed = async function seed(knex) {
  /* ---- provinces, in the order the filter shows them ---- */
  await knex('provinces').insert(PROVINCES.map(function (entry, index) {
    return { name: entry[0], sort_order: (index + 1) * 10 };
  }));

  /* ---- service centres ---- */
  const agencyIds = {};
  const provinceIndexOf = {};
  PROVINCES.forEach(function (entry, index) { provinceIndexOf[entry[0]] = index; });

  for (let i = 0; i < AGENCIES.length; i += 1) {
    /*
     * The province code, city, coordinates and opening hours were columns
     * once. A centre is a name, a province, an address and its phone numbers,
     * plus the three figures the repair system runs on - so the city is now
     * part of the address string rather than a column beside it.
     */
    const [name, code, province, , city, tier, sla, capacity] = AGENCIES[i];

    /*
     * THE DISPLAY ORDER: each province's flagship is placed, in province
     * order, and everything else is left unplaced (NULL) to follow in the
     * natural order. So the storefront's unfiltered list opens with the
     * twenty-three flagships and a province's own list opens with its own -
     * both of which somebody running the network would plausibly choose, and
     * both of which show the column doing something.
     */
    const flagship = /01$/.test(code);

    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('agencies').insert({
      name: name, code: code,
      province: province,
      address: city + ' ' + name + ', Crystal Service Building',
      landmark: tier >= 1 ? LANDMARKS[i % LANDMARKS.length].split('{city}').join(city) : null,
      tier: tier, sla_hours: sla, daily_capacity: capacity,
      sort_order: flagship ? (provinceIndexOf[province] + 1) * 10 : null,
      status: 'ACTIVE'
    }).returning('id');

    const id = typeof rows[0] === 'object' ? rows[0].id : rows[0];
    agencyIds[code] = id;

    /*
     * THE NUMBERS. Every centre has its front desk; a flagship has a repair
     * line of its own as well, and the two factory services an after-hours
     * number - so the storefront has cards with one, two and three numbers,
     * and the labels only where there is more than one to tell apart.
     */
    const phones = [{ phone: '400-820-' + String(1000 + i), label: null }];
    if (tier >= 2) {
      phones[0].label = 'Front desk';
      phones.push({ phone: '400-820-' + String(5000 + i), label: 'Repairs' });
    }
    if (tier === 3) phones.push({ phone: '138-0000-' + String(1000 + i), label: 'After hours' });

    // eslint-disable-next-line no-await-in-loop
    await knex('agency_phones').insert(phones.map(function (entry, index) {
      return { agency_id: id, phone: entry.phone, label: entry.label, sort_order: (index + 1) * 10 };
    }));

    const offered = [];
    ['SMARTPHONE', 'EPRODUCT'].forEach(function (section) {
      (SERVICES_BY_TIER[section][tier] || []).forEach(function (type) {
        offered.push({ agency_id: id, section: section, service_type: type });
      });
    });

    // eslint-disable-next-line no-await-in-loop
    if (offered.length) await knex('agency_services').insert(offered);
  }

  /* ---- FAQ ---- */
  await knex('faqs').insert(FAQS.map(function (row, i) {
    return {
      category: row[0],
      question: row[1],
      answer: row[2],
      sort_order: (i + 1) * 10,
      // A plausible spread, so "Popular Problems" is not simply the first six.
      view_count: [420, 180, 260, 640, 980, 310, 150, 540, 190, 130,
        260, 470, 120, 720, 350, 210, 280, 160, 830, 610, 240, 190][i] || 0,
      status: 'PUBLISHED'
    };
  }));

  /* ---- repair prices ---- */
  const products = await knex('products as p')
    .join('product_categories as c', 'c.id', 'p.category_id')
    .select('p.id', 'p.slug', 'p.price', 'p.series_id', 'c.type as category_type');
  const lines = [];

  products.forEach(function (product) {
    /*
     * A television has no charging port and a set-top box has no screen, so
     * the list a product gets is the one for its category.
     */
    const sheet = product.category_type === 'SMARTPHONE'
      ? PRICE_LINES
      : (EPRODUCT_PRICE_LINES[product.category_type] || PRICE_LINES);

    sheet.forEach(function (line, index) {
      // `component` and `minutes` are read by seed 06, which builds the
      // repair tickets - they describe the WORK, which is the ticket's
      // business rather than the published price list's.
      const [name, , partShare, baseLabour] = line;

      // Software work has no part; everything else scales with the device.
      const partPrice = partShare ? Math.round(Number(product.price) * partShare) : 0;
      const servicePrice = Math.round(baseLabour + Number(product.price) * 0.02);

      lines.push({
        product_id: product.id,
        /*
         * The part as PUBLISHED - a plain string, not a link to the shelf.
         * The price list names things the way a customer would recognise
         * them; the parts catalogue names them the way a technician orders
         * them, and the two lists are allowed to differ.
         */
        part_name: name,
        part_price: partPrice,
        service_price: servicePrice,
        /*
         * The regulator's reference for the published figure.  A string, and
         * deliberately never arithmetic - the format differs by market.
         */
        approval_no: partShare
          ? 'CR-' + String(product.id).padStart(3, '0') + '-' + String((index + 1) * 10)
          : null,
        sort_order: (index + 1) * 10
      });
    });
  });

  await knex('service_prices').insert(lines);

};
