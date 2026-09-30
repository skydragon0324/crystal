/**
 * The catalogue.
 *
 * Small on purpose - nineteen products across five categories is enough to
 * exercise every screen, and a seed file nobody can read is a seed file
 * nobody maintains.  What matters here is that it is COHERENT: every product
 * has a model code the serial mirror can resolve, a warranty term a policy
 * can apply to, and specifications the compare matrix can line up.
 */

/*
 * name, slug, type, sort, description
 *
 * The description is seeded rather than written into the website, because the
 * category list is exactly what a page must not hardcode: the Eproducts index,
 * the header's mega panel and the homepage all draw these tiles, and a copy
 * living in three components is three copies to correct.
 */
const CATEGORIES = [
  ['Smartphones', 'smartphones', 'SMARTPHONE', 10,
    'Four lines, from the flagship C9 to the everyday C3 - every one of them repairable at an authorised centre.'],
  ['Televisions', 'tv', 'TV', 20,
    'Crystal OS on the big screen, 43 to 85 inches, with the same five-year update promise as the phones.'],
  ['Set-top boxes', 'stb', 'STB', 30,
    'Turn any television into a Crystal one - streaming, karaoke and the whole app library.'],
  ['Computers', 'computers', 'COMPUTER', 40,
    'Laptops and desktops for work, built around the same parts catalogue the service centres stock.'],
  ['Cameras', 'cameras', 'CAMERA', 50,
    'Mirrorless bodies and lenses, with sensor cleaning and calibration handled in-house.']
];

const SERIES = [
  ['SMARTPHONE', 'C9', 'c9', 'The flagship line - the most capable handset Crystal builds.', 10],
  ['SMARTPHONE', 'C7', 'c7', 'Flagship cameras and battery, one step down in price.', 20],
  ['SMARTPHONE', 'C5', 'c5', 'The volume line, and the one most repairs arrive from.', 30],
  ['SMARTPHONE', 'C3', 'c3', 'Entry level, built to survive being an entry level phone.', 40],
  ['TV', 'Vision', 'vision', 'Crystal OS televisions, 43 to 85 inches.', 10],
  ['STB', 'Link', 'link', 'Set-top boxes and media players.', 10],
  ['COMPUTER', 'Studio', 'studio', 'Laptops and desktops for work.', 10],
  ['CAMERA', 'Optic', 'optic', 'Mirrorless bodies and lenses.', 10]
];

/* name, slug, series, model code, price, warranty months, featured, hero */
const PRODUCTS = [
  ['Crystal C9 Pro', 'c9-pro', 'c9', 'CR-C9P', 1099, 24, true, true],
  ['Crystal C9', 'c9', 'c9', 'CR-C9', 899, 24, true, false],
  ['Crystal C9 Mini', 'c9-mini', 'c9', 'CR-C9M', 799, 24, false, false],
  ['Crystal C7 Pro', 'c7-pro', 'c7', 'CR-C7P', 749, 24, true, false],
  ['Crystal C7', 'c7', 'c7', 'CR-C7', 599, 12, false, false],
  ['Crystal C5 Plus', 'c5-plus', 'c5', 'CR-C5PL', 449, 12, true, false],
  ['Crystal C5', 'c5', 'c5', 'CR-C5', 349, 12, false, false],
  ['Crystal C3 Power', 'c3-power', 'c3', 'CR-C3PW', 249, 12, false, false],
  ['Crystal C3', 'c3', 'c3', 'CR-C3', 179, 12, false, false],
  ['Crystal Vision 85 QLED', 'vision-85-qled', 'vision', 'CR-V85Q', 2499, 24, true, false],
  ['Crystal Vision 65 QLED', 'vision-65-qled', 'vision', 'CR-V65Q', 1299, 24, false, false],
  ['Crystal Vision 55', 'vision-55', 'vision', 'CR-V55', 799, 24, false, false],
  ['Crystal Vision 43', 'vision-43', 'vision', 'CR-V43', 449, 12, false, false],
  ['Crystal Link 4K', 'link-4k', 'link', 'CR-L4K', 149, 12, false, false],
  ['Crystal Link Karaoke', 'link-karaoke', 'link', 'CR-LKR', 229, 12, false, false],
  ['Crystal Studio 16', 'studio-16', 'studio', 'CR-S16', 1799, 24, true, false],
  ['Crystal Studio 14', 'studio-14', 'studio', 'CR-S14', 1299, 24, false, false],
  ['Crystal Optic R1', 'optic-r1', 'optic', 'CR-OR1', 1599, 24, false, false],
  ['Crystal Optic M2', 'optic-m2', 'optic', 'CR-OM2', 999, 12, false, false]
];

/**
 * The specification dictionary, PER SECTION.
 *
 * The fourth element is the category type the group belongs to; NULL means
 * it applies everywhere. It used to be global, so a television editor was
 * asked for a front camera and a handset editor for a backlight type, and
 * the storefront drew the same empty groups on both.
 *
 * Build and In the box stay global on purpose - every product has a weight
 * and a box.
 */
const SPEC_GROUPS = [
  ['Display', 'DISPLAY', 10, 'SMARTPHONE'],
  ['Performance', 'PERFORMANCE', 20, 'SMARTPHONE'],
  ['Camera', 'CAMERA', 30, 'SMARTPHONE'],
  ['Battery', 'BATTERY', 40, 'SMARTPHONE'],
  ['Connectivity', 'CONNECTIVITY', 50, 'SMARTPHONE'],

  /* Televisions: a panel, not a handset. */
  ['Panel', 'TV_PANEL', 110, 'TV'],
  ['Picture', 'TV_PICTURE', 120, 'TV'],
  ['Sound', 'TV_SOUND', 130, 'TV'],
  ['Smart platform', 'TV_SMART', 140, 'TV'],
  ['Inputs', 'TV_INPUTS', 150, 'TV'],

  /* Set-top boxes. */
  ['Tuner', 'STB_TUNER', 210, 'STB'],
  ['Decoding', 'STB_DECODING', 220, 'STB'],
  ['Storage', 'STB_STORAGE', 230, 'STB'],
  ['Connections', 'STB_PORTS', 240, 'STB'],

  /* Computers. */
  ['Processor', 'PC_CPU', 310, 'COMPUTER'],
  ['Memory and storage', 'PC_MEMORY', 320, 'COMPUTER'],
  ['Screen', 'PC_SCREEN', 330, 'COMPUTER'],
  ['Graphics', 'PC_GRAPHICS', 340, 'COMPUTER'],
  ['Ports', 'PC_PORTS', 350, 'COMPUTER'],

  /* IP cameras and recorders - the category is surveillance, not phones. */
  ['Optics', 'CAM_OPTICS', 410, 'CAMERA'],
  ['Sensor', 'CAM_SENSOR', 420, 'CAMERA'],
  ['Night vision', 'CAM_NIGHT', 430, 'CAMERA'],
  ['Recording', 'CAM_RECORDING', 440, 'CAMERA'],
  ['Weatherproofing', 'CAM_HOUSING', 450, 'CAMERA'],

  /* Everywhere. */
  // Sorted AFTER every section group, so a sheet reads its own subject
  // first and the shared rows last - not 'Build, In the box, Panel'.
  ['Build', 'BUILD', 900, null],
  /*
   * The box, as a SPECIFICATION GROUP rather than as a band of pictures on
   * the product page.
   *
   * It used to be six square tiles, one per boxed item, and there is no
   * photography for any of them - so what it drew was six empty grey
   * squares. What is in the box is a list of words; it belongs in the
   * sheet, which is where the rest of the words already are.
   * `product_accessories` remains the structured copy, for the console and
   * for anything that needs the items row by row.
   */
  ['In the box', 'IN_THE_BOX', 910, null]
];

/* group, name, unit, compare_enabled */
const SPEC_DEFS = [
  ['DISPLAY', 'Screen size', 'in', true],
  ['DISPLAY', 'Resolution', null, true],
  ['DISPLAY', 'Refresh rate', 'Hz', true],
  ['DISPLAY', 'Panel type', null, false],
  ['PERFORMANCE', 'Processor', null, true],
  ['PERFORMANCE', 'Memory', 'GB', true],
  ['PERFORMANCE', 'Storage', 'GB', true],
  ['CAMERA', 'Main camera', 'MP', true],
  ['CAMERA', 'Front camera', 'MP', true],
  ['CAMERA', 'Optical zoom', 'x', false],
  ['BATTERY', 'Capacity', 'mAh', true],
  ['BATTERY', 'Fast charging', 'W', true],
  ['CONNECTIVITY', 'Cellular', null, true],
  ['CONNECTIVITY', 'Wi-Fi', null, false],
  /* Televisions. */
  ['TV_PANEL', 'Panel size', 'in', true],
  ['TV_PANEL', 'Panel type', null, true],
  ['TV_PANEL', 'Backlight', null, false],
  ['TV_PICTURE', 'Resolution', null, true],
  ['TV_PICTURE', 'Refresh rate', 'Hz', true],
  ['TV_PICTURE', 'Peak brightness', 'nits', true],
  ['TV_PICTURE', 'Colour system', null, false],
  ['TV_SOUND', 'Speaker output', 'W', true],
  ['TV_SOUND', 'Audio decoding', null, false],
  ['TV_SMART', 'Platform', null, false],
  ['TV_SMART', 'Voice control', null, false],
  ['TV_INPUTS', 'HDMI ports', null, true],
  ['TV_INPUTS', 'Wireless', null, false],

  /* Set-top boxes. */
  ['STB_TUNER', 'Tuner type', null, true],
  ['STB_TUNER', 'Channel capacity', null, false],
  ['STB_DECODING', 'Maximum resolution', null, true],
  ['STB_DECODING', 'Codecs', null, false],
  ['STB_STORAGE', 'Internal storage', 'GB', true],
  ['STB_STORAGE', 'Recording', null, false],
  ['STB_PORTS', 'Video output', null, false],
  ['STB_PORTS', 'Network', null, false],

  /* Computers. */
  ['PC_CPU', 'Processor', null, true],
  ['PC_CPU', 'Cores', null, true],
  ['PC_MEMORY', 'Memory', 'GB', true],
  ['PC_MEMORY', 'Storage', 'GB', true],
  ['PC_SCREEN', 'Screen size', 'in', true],
  ['PC_SCREEN', 'Resolution', null, true],
  ['PC_GRAPHICS', 'Graphics', null, true],
  ['PC_PORTS', 'Ports', null, false],
  ['PC_PORTS', 'Wireless', null, false],

  /* IP cameras and recorders. */
  ['CAM_OPTICS', 'Lens', null, true],
  ['CAM_OPTICS', 'Field of view', null, true],
  ['CAM_SENSOR', 'Sensor resolution', 'MP', true],
  ['CAM_SENSOR', 'Sensor size', null, false],
  ['CAM_NIGHT', 'Night vision range', 'm', true],
  ['CAM_NIGHT', 'Illuminator', null, false],
  ['CAM_RECORDING', 'Recording resolution', null, true],
  ['CAM_RECORDING', 'Storage', null, false],
  ['CAM_HOUSING', 'Weather rating', null, true],

  /* Everywhere. */
  ['BUILD', 'Weight', 'g', true],
  ['BUILD', 'Water resistance', null, false],
  // Never compare_enabled: a compare column lines two values up against
  // each other, and two different lists of box contents do not line up.
  ['IN_THE_BOX', 'Box contents', null, false]
];

/**
 * Finishes.
 *
 * Named per line rather than per product so that a C9 Pro and a C9 share a
 * palette - which is what a real range does, and what makes the colour dots
 * on a listing page read as a family instead of as nineteen unrelated
 * swatches.  The hex is the swatch itself: a product card has to draw the dot
 * before any artwork has loaded.
 */
const PALETTES = {
  c9: [
    ['Glacier Blue', '#B9CCE0'],
    ['Obsidian', '#22262B'],
    ['Pearl White', '#EDEFF2'],
    ['Mint', '#BFD9CD']
  ],
  c7: [
    ['Mint Green', '#BCD8C8'],
    ['Midnight', '#20242C'],
    ['Frost', '#E4E9F0']
  ],
  c5: [
    ['Lavender', '#CFC7E4'],
    ['Graphite', '#3A3F46'],
    ['Ice Blue', '#C6D8EA']
  ],
  c3: [
    ['Ocean', '#3F6DB5'],
    ['Charcoal', '#2E3238'],
    ['Sand', '#DCD3C4']
  ],
  vision: [['Slate', '#43484F'], ['Silver', '#D6D9DD']],
  link: [['Charcoal', '#2E3238']],
  studio: [['Space Grey', '#4A4F56'], ['Silver', '#D6D9DD']],
  optic: [['Black', '#1E2126'], ['Silver', '#D6D9DD']]
};

/**
 * What is in the box.
 *
 * Keyed by category type, because a television and a handset genuinely ship
 * with different things and a "SIM ejector" under a TV is the sort of detail
 * that makes a whole page look untrue.  The charger wattage is read back off
 * the fast-charging specification rather than typed, so the box and the
 * specification sheet cannot disagree.
 */
const IN_THE_BOX = {
  SMARTPHONE: ['The handset', 'USB-C cable', '{W}W fast charger', 'SIM ejector', 'Quick start guide', 'Protective case'],
  TV: ['The television', 'Stand and fixings', 'Remote control', 'Power cable', 'Quick start guide'],
  STB: ['The box', 'Remote control', 'HDMI cable', 'Power adapter', 'Quick start guide'],
  COMPUTER: ['The machine', 'USB-C charger', 'Power cable', 'Quick start guide'],
  CAMERA: ['The body', 'Battery', 'Charger', 'Neck strap', 'Quick start guide']
};

/**
 * Specification values, derived from the product rather than listed.
 *
 * Nineteen products times sixteen definitions is three hundred rows, and a
 * hand written table that size is one nobody proof-reads.  Deriving them from
 * the price and the series keeps them plausible AND keeps the compare matrix
 * honest: a C9 Pro really does come out ahead of a C3 on every row that has a
 * number in it, which is what makes the `differs` highlighting worth looking
 * at while developing.
 */
function specsFor(product, series) {
  const tier = { c9: 4, c7: 3, c5: 2, c3: 1 }[series] || 0;

  /*
   * Where a product sits WITHIN its line.
   *
   * Without this every handset in a series had identical specifications, and
   * the compare matrix - whose whole job is to highlight differences - came
   * back with nothing highlighted for the three products a customer is most
   * likely to compare.  A Pro and a Mini of the same generation differ in
   * exactly these four rows, so those are the four that move.
   */
  const variant = /pro/i.test(product.name) ? 1 : (/mini/i.test(product.name) ? -1 : 0);
  const step = function (values, by) {
    const index = Math.min(values.length - 1, Math.max(0, tier + by));
    return values[index];
  };

  /*
   * A NON-PHONE ANSWERS ITS OWN SHEET.
   *
   * The groups are scoped by category now, so a television is asked about
   * its panel and a camera about its optics - and neither is offered a
   * front camera row it would have to leave blank.
   */
  if (!tier) {
    const inches = product.name.match(/(\d{2})/) ? product.name.match(/(\d{2})/)[1] : '15.6';
    const premium = product.price > 1000;

    if (product.type === 'TV') {
      return {
        'Panel size': inches,
        'Panel type': premium ? 'QLED' : 'LED',
        Backlight: premium ? 'Full array local dimming' : 'Edge lit',
        Resolution: premium ? '3840 x 2160' : '1920 x 1080',
        'Refresh rate': premium ? '120' : '60',
        'Peak brightness': premium ? '1200' : '400',
        'Colour system': premium ? 'Quantum dot, 10 bit' : '8 bit',
        'Speaker output': premium ? '40' : '20',
        'Audio decoding': 'Dolby Atmos, DTS',
        Platform: 'Crystal Vision OS',
        'Voice control': premium ? 'Far field microphone' : 'Remote microphone',
        'HDMI ports': premium ? '4' : '3',
        Wireless: 'Wi-Fi 6, Bluetooth 5.2',
        Weight: String(Math.round(product.price * 2))
      };
    }

    if (product.type === 'STB') {
      return {
        'Tuner type': premium ? 'DVB-T2 and DVB-S2' : 'DVB-T2',
        'Channel capacity': premium ? '2000' : '1000',
        'Maximum resolution': premium ? '3840 x 2160' : '1920 x 1080',
        Codecs: 'H.265, H.264, AV1',
        'Internal storage': premium ? '64' : '16',
        Recording: premium ? 'Twin tuner, record while watching' : 'Single tuner',
        'Video output': 'HDMI 2.1, optical audio',
        Network: 'Gigabit Ethernet, Wi-Fi 6',
        Weight: String(Math.round(product.price * 2))
      };
    }

    if (product.type === 'CAMERA') {
      return {
        Lens: premium ? '2.8-12mm motorised' : '2.8mm fixed',
        'Field of view': premium ? '108 to 33 degrees' : '104 degrees',
        'Sensor resolution': premium ? '8' : '4',
        'Sensor size': premium ? '1/1.8 inch' : '1/2.7 inch',
        'Night vision range': premium ? '50' : '30',
        Illuminator: premium ? 'Infrared and white light' : 'Infrared',
        'Recording resolution': premium ? '3840 x 2160' : '2560 x 1440',
        Storage: 'microSD up to 512GB, network recorder',
        'Weather rating': premium ? 'IP67' : 'IP65',
        Weight: String(Math.round(product.price * 2))
      };
    }

    /* Computers. */
    return {
      Processor: premium ? 'Crystal V9 twelve core' : 'Crystal V5 eight core',
      Cores: premium ? '12' : '8',
      Memory: product.price > 1200 ? '16' : '8',
      Storage: product.price > 1200 ? '512' : '128',
      'Screen size': inches,
      Resolution: premium ? '3840 x 2160' : '1920 x 1080',
      Graphics: premium ? 'Crystal G7 discrete' : 'Integrated',
      Ports: premium ? '2x USB-C, 2x USB-A, HDMI, SD' : '1x USB-C, 2x USB-A, HDMI',
      Wireless: 'Wi-Fi 6, Bluetooth 5.2',
      Weight: String(Math.round(product.price * 2))
    };
  }

  return {
    // The four rows a Pro and a Mini of one generation actually differ on.
    'Screen size': step([null, '5.8', '6.1', '6.4', '6.7', '6.9'], variant + 1),
    Resolution: tier >= 3 ? '2796 x 1290' : '2340 x 1080',
    'Refresh rate': [null, '60', '90', '120', '144'][tier],
    'Panel type': tier >= 3 ? 'LTPO OLED' : 'OLED',
    Processor: 'Crystal Halo ' + [null, 'A1', 'A3', 'A5', 'A7'][tier],
    Memory: [null, '4', '8', '12', '16'][tier],
    Storage: step([null, '64', '128', '256', '512', '1024'], variant + 1),
    'Main camera': step([null, '13', '48', '50', '108', '200'], variant + 1),
    'Front camera': [null, '5', '12', '20', '32'][tier],
    'Optical zoom': step([null, '1', '2', '3', '5', '10'], variant + 1),
    Capacity: step([null, '3800', '4200', '4500', '4800', '5400'], variant + 1),
    'Fast charging': [null, '18', '33', '67', '120'][tier],
    Cellular: tier >= 2 ? '5G' : '4G LTE',
    'Wi-Fi': tier >= 3 ? 'Wi-Fi 7' : 'Wi-Fi 6',
    Weight: String(170 + tier * 8 + variant * 12),
    'Water resistance': tier >= 3 ? 'IP68' : 'IP54'
  };
}

exports.seed = async function seed(knex) {
  /* ---- categories ---- */
  const categoryIds = {};
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const [name, slug, type, sort, description] = CATEGORIES[i];
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('product_categories')
      .insert({
        name: name, slug: slug, type: type, sort_order: sort, status: 'ACTIVE',
        description: description,
        // A section tile is a name, a line of copy and a mark; without the
        // icon it is a name in a box, which is what an unfinished page looks
        // like rather than a deliberate one.
        icon: '/uploads/categories/' + slug + '.svg'
      })
      .returning('id');
    categoryIds[type] = typeof rows[0] === 'object' ? rows[0].id : rows[0];
  }

  /* ---- series ---- */
  const seriesIds = {};
  for (let i = 0; i < SERIES.length; i += 1) {
    const [type, name, slug, description, sort] = SERIES[i];
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('product_series').insert({
      category_id: categoryIds[type],
      name: name, slug: slug, description: description, sort_order: sort, status: 'ACTIVE',
      // The landing page draws a series as a picture with a name on it, so a
      // series with no banner is a hole in the page rather than a smaller
      // tile.  Every line gets one, at both widths.
      banner_image: '/uploads/series/' + slug + '-banner.svg',
      banner_image_mobile: '/uploads/series/' + slug + '-banner-mobile.svg'
    }).returning('id');
    seriesIds[slug] = {
      id: typeof rows[0] === 'object' ? rows[0].id : rows[0],
      category: categoryIds[type],
      type: type
    };
  }

  /* ---- products ---- */
  const productIds = {};
  for (let i = 0; i < PRODUCTS.length; i += 1) {
    const [name, slug, series, modelCode, price, warrantyMonths, featured, hero] = PRODUCTS[i];
    const parent = seriesIds[series];

    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('products').insert({
      category_id: parent.category,
      series_id: parent.id,
      name: name,
      slug: slug,
      model_code: modelCode,
      tagline: name + ' - built to be repaired, not replaced.',
      description: 'Crystal ' + name + '. Serviceable at every authorised centre, with parts held in stock nationwide.',
      main_image: '/uploads/products/' + slug + '/main.svg',
      main_image_mobile: '/uploads/products/' + slug + '/main-mobile.svg',
      price: price,
      currency: 'USD',
      release_date: new Date(Date.now() - (i * 45 + 30) * 86400000).toISOString().slice(0, 10),
      status: 'PUBLISHED',
      is_featured: featured,
      is_hero: hero,
      warranty_months: warrantyMonths,
      /*
       * The rating is a SUMMARY carried from the Eshop, which spec 1.1 puts
       * outside this system - there is no reviews table here to aggregate.
       * Seeded from the price so the range reads plausibly (a flagship scores
       * higher and is reviewed more often) instead of nineteen products all
       * sitting on 4.5.
       */
      rating_avg: Math.round((4.1 + Math.min(0.8, price / 3200)) * 10) / 10,
      rating_count: 40 + ((i * 137) % 260) + (featured ? 180 : 0),
      sort_order: (i + 1) * 10
    }).returning('id');

    productIds[slug] = {
      id: typeof rows[0] === 'object' ? rows[0].id : rows[0],
      name: name, price: price, series: series,
      category: parent.category, type: parent.type
    };
  }

  /* ---- the specification dictionary ---- */
  /* The categories, so a group can be pinned to one by type. */
  const categoryByType = {};
  (await knex('product_categories').select('id', 'type')).forEach(function (row) {
    categoryByType[row.type] = row.id;
  });

  const groupIds = {};
  const groupCategory = {};
  for (let i = 0; i < SPEC_GROUPS.length; i += 1) {
    const [name, code, sort, categoryType] = SPEC_GROUPS[i];
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('specification_groups')
      .insert({
        name: name, code: code, sort_order: sort,
        // NULL means the group applies to every product.
        product_category_id: categoryType ? categoryByType[categoryType] : null
      })
      .returning('id');
    groupIds[code] = typeof rows[0] === 'object' ? rows[0].id : rows[0];
    groupCategory[code] = categoryType || null;
  }

  const defIds = {};
  // Which category each GROUP belongs to, so a value can be matched to the
  // definition its own product is allowed to answer. null = every product.
  const defGroup = {};
  for (let i = 0; i < SPEC_DEFS.length; i += 1) {
    const [group, name, unit, compare] = SPEC_DEFS[i];
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('specification_definitions').insert({
      group_id: groupIds[group], name: name, unit: unit,
      compare_enabled: compare, sort_order: (i + 1) * 10
    }).returning('id');
    /*
     * KEYED BY GROUP AND NAME, because names collide by design.
     *
     * 'Resolution' is a display row on a handset, a picture row on a
     * television and a screen row on a computer - three different
     * definitions in three different groups. Keyed by name alone the last
     * one would win and every product would point at the same row.
     */
    const id = typeof rows[0] === 'object' ? rows[0].id : rows[0];
    defIds[group + ':' + name] = id;

    // The group a definition belongs to decides which products can use it.
    defGroup[group] = groupCategory[group] || null;
  }

  /**
 * The definition a product's sheet row means.
   *
   * A name is only unique WITHIN a group, so the lookup walks the groups
   * this product category is allowed to use - its own first, then the
   * global ones - and takes the first match.
   */
  const definitionFor = function (categoryType, name) {
    const codes = Object.keys(defGroup).filter(function (code) {
      return defGroup[code] === categoryType;
    }).concat(Object.keys(defGroup).filter(function (code) {
      return defGroup[code] === null;
    }));

    for (let i = 0; i < codes.length; i += 1) {
      const found = defIds[codes[i] + ':' + name];
      if (found) return found;
    }
    return null;
  };

  /* ---- and the values ---- */
  const values = [];
  Object.keys(productIds).forEach(function (slug) {
    const product = productIds[slug];
    const sheet = specsFor(product, product.series);

    Object.keys(sheet).forEach(function (definition, index) {
      const id = definitionFor(product.type, definition);
      if (!id || sheet[definition] === undefined || sheet[definition] === null) return;

      values.push({
        product_id: product.id,
        specification_id: id,
        value: String(sheet[definition]),
        sort_order: (index + 1) * 10
      });
    });
  });

  await knex('product_specifications').insert(values);

  /* ---- finishes ---- */
  const colors = [];
  Object.keys(productIds).forEach(function (slug) {
    const product = productIds[slug];
    const palette = PALETTES[product.series] || [];

    /*
     * A Mini gets the first two finishes and a Pro the whole palette.  Giving
     * every product in a line the identical set makes the swatch row on a
     * listing page pure decoration; this way it carries one real fact.
     */
    const count = /pro/i.test(product.name)
      ? palette.length
      : (/mini/i.test(product.name) ? Math.min(2, palette.length) : Math.min(3, palette.length));

    palette.slice(0, count).forEach(function (entry, index) {
      colors.push({
        product_id: product.id,
        name: entry[0],
        hex: entry[1],
        sort_order: (index + 1) * 10
      });
    });
  });
  if (colors.length) await knex('product_colors').insert(colors);

  /* ---- what is in the box ---- */
  const accessories = [];
  Object.keys(productIds).forEach(function (slug) {
    const product = productIds[slug];
    const sheet = specsFor(product, product.series);
    const list = IN_THE_BOX[product.type] || [];

    list.forEach(function (item, index) {
      // {W} is the fast-charging figure off the specification sheet, so the
      // box and the sheet cannot come to disagree about the charger.
      const name = item.replace('{W}', sheet['Fast charging'] || '33')
        .replace('The handset', product.name)
        .replace('The television', product.name)
        .replace('The machine', product.name)
        .replace('The body', product.name)
        .replace('The box', product.name);

      accessories.push({
        product_id: product.id,
        name: name,
        image: '/uploads/products/' + slug + '/box-' + (index + 1) + '.svg',
        sort_order: (index + 1) * 10
      });
    });
  });
  if (accessories.length) await knex('product_accessories').insert(accessories);

  /*
   * The same list again, as the sheet's one "In the box" row.
   *
   * Built from the accessory rows just assembled rather than from
   * IN_THE_BOX directly, so the sheet and the accessory table cannot come
   * to disagree - the {W} substitution above has already happened by this
   * point, and doing it twice is how the charger wattage drifts.
   */
  const boxSpec = [];
  Object.keys(productIds).forEach(function (slug) {
    const product = productIds[slug];
    const mine = accessories.filter(function (row) { return row.product_id === product.id; });
    const boxDefinition = definitionFor(product.type, 'Box contents');
    if (!mine.length || !boxDefinition) return;

    boxSpec.push({
      product_id: product.id,
      specification_id: boxDefinition,
      value: mine.map(function (row) { return row.name; }).join(', '),
      sort_order: 10
    });
  });

  if (boxSpec.length) await knex('product_specifications').insert(boxSpec);
};
