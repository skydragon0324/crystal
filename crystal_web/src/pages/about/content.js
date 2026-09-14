import * as zh from './content.zh';
import * as ru from './content.ru';

/**
 * The languages this page has been written in.
 *
 * English lives in this file, because it is the source the rest is translated
 * from. Every other language is a module of its own with the same shape - see
 * content.zh.js for why that is a file rather than dictionary entries.
 */
const TRANSLATIONS = { zh: zh, ru: ru };

/**
 * One object over another, string fields only, missing ones left alone.
 *
 * Deliberately shallow and deliberately narrow: a translation supplies words,
 * and anything that is not a string here is an address - a slot name, an icon,
 * a link, a number on a chart. Merging those would let a translation lose a
 * picture, which is a strange way for a language file to fail.
 */
function merge(english, translated) {
  const out = { ...english };

  Object.keys(translated).forEach((field) => {
    if (typeof translated[field] === 'string' && translated[field]) {
      out[field] = translated[field];
    }
  });

  return out;
}

/**
 * THE ABOUT PAGE, IN WORDS - and this file is the whole of them.
 *
 * Every sentence on /about used to be rows in three database tables, edited
 * through ten console screens. That was the wrong shape for what this page is.
 * A company introduction is not content that turns over: it is the company's
 * own account of itself, rewritten every few years by somebody who cares about
 * the wording. As rows it could not be reviewed, could not be diffed, and
 * could not be translated alongside the rest of the site's copy - and ten
 * screens existed to change text nobody changes.
 *
 * So it lives here, in one file, under review like every other line.
 *
 * THE PICTURES ARE STILL DATA, and they are the one thing that could not move.
 * A photograph of the factory floor is uploaded, replaced when the floor is
 * repainted, and has to be served from somewhere. The backend keeps them in
 * `about_images`, keyed by the SLOT names below, and `buildAbout()` marries the
 * two: static words, uploaded pictures.
 *
 * Every string here is written in English and passed through `t()` by the
 * components, so it translates the way the rest of the site does.
 */

/* ------------------------------------------------------------------ */
/*  the chapters                                                       */
/* ------------------------------------------------------------------ */

/**
 * One entry per band. `slot` names the picture the backend serves for it, or
 * null for a chapter that is type only.
 */
export const SECTIONS = {
  OVERVIEW: {
    eyebrow: 'About Crystal',
    title: 'Technology. Manufacturing. Commerce.',
    subtitle: null,
    description: 'Crystal designs and builds the electronics it sells. Smartphones on our own silicon, televisions and set-top boxes on the same operating system, and the factory, the institute and the service network that stand behind all of them.\n\nEleven years ago we assembled set-top boxes for other companies. We kept the factory, learned to write the software, and stopped putting somebody else\'s name on the box.',
    slot: 'overview'
  },

  VISION: {
    eyebrow: 'Our vision',
    title: 'Technology that improves everyday life.',
    subtitle: null,
    description: 'A device is worth owning for as long as it is safe to use and cheap to fix. Everything we build is measured against that, which is why a phone at 179 dollars gets the same five years of updates as the flagship above it.',
    slot: null
  },

  BUSINESSES: {
    eyebrow: 'What we do',
    title: 'Seven businesses, one company.',
    subtitle: 'From the silicon in a handset to the shelf it is sold from.',
    description: null,
    slot: 'businesses'
  },

  RECOGNITION: {
    eyebrow: 'Recognition',
    title: 'Recognised among the Top 10 IT companies.',
    subtitle: 'Independent assessment of what we build and how we build it.',
    description: null,
    slot: null
  },

  HISTORY: {
    eyebrow: 'Our history',
    title: 'Eleven years of Crystal.',
    subtitle: 'From a contract assembly line to a company that designs what it makes.',
    description: null,
    slot: null
  },

  INSTITUTE: {
    eyebrow: 'Research',
    title: 'Crystal IT Institute',
    subtitle: 'Research. Create. Transform.',
    description: 'Four hundred engineers in Shanghai and Hangzhou. The institute owns Crystal OS, the imaging pipeline, the Halo and Nova platforms, and the connected-device stack that ties a television to a handset. It is slower than buying a reference design, and it is the reason a camera behaves the same on a C5 as on a C9.',
    slot: 'institute'
  },

  FACTORY: {
    eyebrow: 'Where we manufacture',
    title: 'Eproduct Factory',
    subtitle: 'Quality built into every product.',
    description: 'Forty thousand square metres outside Suzhou, and the oldest part of this company. Surface mount, assembly, functional test and packaging happen under one roof, which is what lets a fault found in testing reach the line that caused it the same afternoon.',
    slot: 'factory'
  },

  MANUFACTURING: {
    eyebrow: 'How we manufacture',
    title: 'Manufacturing Excellence',
    subtitle: 'From components to finished products.',
    description: 'Eight stages between a reel of components and a sealed box, every one of them measured. A device that fails at any of them goes back to the stage that built it rather than forward to the one that would have hidden it.',
    slot: 'manufacturing'
  },

  SHOP: {
    eyebrow: 'Where to find us',
    title: 'Crystal Shop',
    subtitle: 'Experience Crystal in person.',
    description: 'Three floors on Nanjing East Road: the range, the living room, and the counter that fixes what you already own.',
    slot: 'shop'
  },

  SERVICE: {
    eyebrow: 'After the sale',
    title: 'After-Service',
    subtitle: 'Support beyond the purchase.',
    description: 'We design it, we manufacture it, we sell it, and we are the ones who repair it. Every part price is published before you need it, and every centre takes walk-ins.',
    slot: 'service'
  },

  PRESENCE: {
    eyebrow: 'Where we are',
    title: 'Crystal Presence',
    subtitle: 'Connecting people through technology.',
    description: 'A head office, an institute across two cities, one factory, the flagship shop, and a service centre in every province we sell in.',
    slot: 'presence'
  }
};

/* ------------------------------------------------------------------ */
/*  the lists inside them                                             */
/* ------------------------------------------------------------------ */

export const ITEMS = {
  FACT: [
    {
      title: 'Years',
      subtitle: null,
      description: null,
      value: '11'
    },
    {
      title: 'Businesses',
      subtitle: null,
      description: null,
      value: '7'
    },
    {
      title: 'IT ranking',
      subtitle: null,
      description: null,
      value: 'Top 10'
    },
    {
      title: 'Engineers',
      subtitle: null,
      description: null,
      value: '400+'
    }
  ],

  BUSINESS: [
    {
      title: 'Smartphones',
      subtitle: 'C9, C7, C5 and C3',
      description: 'Six handsets across four lines, on our own Halo and Nova platforms, all of them carrying five years of security updates.',
      featured: 'true',
      link: '/smartphones',
      image: 'smartphones'
    },
    {
      title: 'Software Development',
      subtitle: 'Crystal OS and the platform',
      description: 'The operating system on every Crystal device, the imaging pipeline behind the cameras, and the services that connect them.',
      featured: 'true',
      image: 'software'
    },
    {
      title: 'Eproduct Business',
      subtitle: 'TV, set-top box, computer, camera',
      description: 'Televisions, streaming devices, computers and imaging hardware - the same operating system as the handsets, on a bigger screen.',
      featured: 'true',
      link: '/eproducts',
      image: 'eproducts'
    },
    {
      title: 'Commerce Trading',
      subtitle: 'Components and distribution',
      description: 'The supply relationships that keep the factory running, and the distribution network that moves what it builds.',
      image: 'trading'
    },
    {
      title: 'Print Business',
      subtitle: 'Packaging and print',
      description: 'Every box, manual and label a Crystal product ships in, printed in-house.',
      image: 'print'
    },
    {
      title: 'E-Commerce',
      subtitle: 'Crystal Eshop',
      description: 'The online store, its accessories catalogue and the logistics behind it.',
      link: 'https://eshop.crystal.example',
      image: 'ecommerce'
    },
    {
      title: 'Commerce',
      subtitle: 'Retail and partners',
      description: 'The flagship shop, the authorised resellers, and the counters inside them.',
      image: 'commerce'
    }
  ],

  HISTORY_EVENT: [
    {
      title: 'Crystal is founded',
      subtitle: null,
      description: 'Sixteen people outside Suzhou, assembling set-top boxes for other companies.',
      year: 2016
    },
    {
      title: 'The factory doubles',
      subtitle: null,
      description: 'A second line, and the first quality system worth the name. We stop losing money on rework.',
      year: 2017,
      image: 'history-2017'
    },
    {
      title: 'The first Crystal handset',
      subtitle: null,
      description: 'The C1 ships. It is unremarkable, and it teaches us how to build a supply chain.',
      year: 2018,
      image: 'history-2018'
    },
    {
      title: 'Crystal OS 1.0',
      subtitle: null,
      description: 'We stop shipping somebody else\'s software and start shipping our own.',
      year: 2019
    },
    {
      title: 'The IT Institute opens',
      subtitle: null,
      description: 'Eighty engineers in Shanghai, with a mandate to own the platform rather than license it.',
      year: 2020,
      image: 'history-2020'
    },
    {
      title: 'The service network',
      subtitle: null,
      description: 'Authorised centres in nine provinces, with one published price list between them.',
      year: 2021
    },
    {
      title: 'Crystal Vision',
      subtitle: null,
      description: 'Televisions and the karaoke stack, built on the same operating system as the phones.',
      year: 2022,
      image: 'history-2022'
    },
    {
      title: 'Top 10 IT company',
      subtitle: null,
      description: 'Independent recognition of the platform work, eight years after the first line started.',
      year: 2023
    },
    {
      title: 'The Halo platform',
      subtitle: null,
      description: 'In-house silicon. The C9 line is the first to carry it.',
      year: 2024,
      image: 'history-2024'
    },
    {
      title: 'The three-floor shop',
      subtitle: null,
      description: 'Nanjing East Road opens: the range, the living room and the repair counter under one roof.',
      year: 2025
    },
    {
      title: 'Five-year updates on everything',
      subtitle: null,
      description: 'Including the C3 at 179 dollars, which costs us more per device than the flagship.',
      year: 2026,
      image: 'history-2026'
    }
  ],

  RESEARCH_AREA: [
    {
      title: 'Software Development',
      subtitle: null,
      description: 'Crystal OS, the update pipeline, and the services behind both.',
      icon: 'FiCode'
    },
    {
      title: 'Mobile Technology',
      subtitle: null,
      description: 'Radio, power and thermal work on the Halo and Nova platforms.',
      icon: 'FiSmartphone'
    },
    {
      title: 'Crystal OS',
      subtitle: null,
      description: 'One operating system across handsets, televisions and set-top boxes.',
      icon: 'FiLayers'
    },
    {
      title: 'Imaging and AI',
      subtitle: null,
      description: 'The camera pipeline, and the on-device models that run inside it.',
      icon: 'FiCpu'
    },
    {
      title: 'IoT and Connected Devices',
      subtitle: null,
      description: 'How a television, a handset and a set-top box find each other on a home network.',
      icon: 'FiWifi'
    },
    {
      title: 'Security and Updates',
      subtitle: null,
      description: 'Five years of patches on every model, and the infrastructure that delivers them.',
      icon: 'FiShield'
    }
  ],

  FACTORY_CAPABILITY: [
    {
      title: 'Assembly Line',
      subtitle: null,
      description: 'Four lines, reconfigurable between handsets and larger eproducts within a shift.',
      image: 'factory-assembly'
    },
    {
      title: 'Testing Facility',
      subtitle: null,
      description: 'Environmental, drop, radio and battery testing on site rather than at a lab three weeks away.',
      image: 'factory-testing'
    },
    {
      title: 'Quality Control',
      subtitle: null,
      description: 'Sampling at every stage, with the results tied back to the line and the shift that produced them.',
      image: 'factory-quality'
    },
    {
      title: 'Production Capacity',
      subtitle: null,
      description: 'Around 1.2 million devices a year at current staffing, across both product families.',
      image: 'factory-capacity'
    }
  ],

  MANUFACTURING_CAPABILITY: [
    {
      title: 'Smartphone Manufacturing',
      subtitle: null,
      description: 'Board to sealed box on one site, including the display bonding most contract manufacturers send out.',
      image: 'mfg-smartphone'
    },
    {
      title: 'SMT',
      subtitle: null,
      description: 'Six surface-mount lines with automated optical inspection between every stage.',
      image: 'mfg-smt'
    },
    {
      title: 'Quality Assurance',
      subtitle: null,
      description: 'A sampling plan per model, and a failure that stops the line rather than filling a report.',
      image: 'mfg-qa'
    },
    {
      title: 'Packaging',
      subtitle: null,
      description: 'Printed, assembled and filled in-house - which is why a box arrives with the device rather than three weeks after it.',
      image: 'mfg-packaging'
    }
  ],

  MANUFACTURING_STAGE: [
    {
      title: 'Components',
      subtitle: null,
      description: 'Incoming inspection, and a reel that fails it never reaches a line.'
    },
    {
      title: 'SMT',
      subtitle: null,
      description: 'Paste, place, reflow, and optical inspection after each.'
    },
    {
      title: 'Assembly',
      subtitle: null,
      description: 'Display bonding, battery, housing and the seals that decide an ingress rating.'
    },
    {
      title: 'Software',
      subtitle: null,
      description: 'Crystal OS, the region configuration and the calibration data for that unit\'s own camera.'
    },
    {
      title: 'Functional Testing',
      subtitle: null,
      description: 'Every radio, every sensor, every port, on every unit - not on a sample.'
    },
    {
      title: 'QA Inspection',
      subtitle: null,
      description: 'Cosmetic and functional sampling against the plan for that model.'
    },
    {
      title: 'Packaging',
      subtitle: null,
      description: 'Accessories, documentation, seal and serial registration.'
    },
    {
      title: 'Finished Product',
      subtitle: null,
      description: 'Palletised, and its serial already known to the warranty system.'
    }
  ],

  SHOP_FLOOR: [
    {
      title: 'The range',
      subtitle: 'First floor',
      description: 'Every current handset, set up and signed in, with the accessories that go with them. Buy, or bring a device in and have it set up here.',
      floor: 1,
      image: 'shop-1f'
    },
    {
      title: 'The living room',
      subtitle: 'Second floor',
      description: 'Televisions, set-top boxes, cameras and the karaoke stack, in rooms built to look like rooms rather than like shelves.',
      floor: 2,
      image: 'shop-2f'
    },
    {
      title: 'The service counter',
      subtitle: 'Third floor',
      description: 'A full authorised service centre: repairs, warranty, OS installs and device registration. Walk in.',
      floor: 3,
      image: 'shop-3f'
    }
  ],

  SERVICE: [
    {
      title: 'Smartphone Repair',
      subtitle: null,
      description: 'Screens, batteries, ports and boards, at a price published before you need it.',
      icon: 'FiSmartphone'
    },
    {
      title: 'Eproduct Repair',
      subtitle: null,
      description: 'Televisions, set-top boxes, computers and cameras, at the centres that list them.',
      icon: 'FiTv'
    },
    {
      title: 'Software Service',
      subtitle: null,
      description: 'Crystal OS installs and recovery, while you wait, at any authorised centre.',
      icon: 'FiDownloadCloud'
    },
    {
      title: 'Warranty',
      subtitle: null,
      description: 'Registered to your account rather than to a receipt you have to keep.',
      icon: 'FiShield'
    },
    {
      title: 'Crystal Care+',
      subtitle: null,
      description: 'Accidental damage cover, bought at any time while the device is still under warranty.',
      icon: 'FiUmbrella'
    }
  ],

  LOCATION: [
    {
      title: 'Headquarters',
      subtitle: 'Shanghai',
      description: 'Head office and the commercial businesses.'
    },
    {
      title: 'IT Institute',
      subtitle: 'Shanghai and Hangzhou',
      description: 'Four hundred engineers across two campuses.'
    },
    {
      title: 'Eproduct Factory',
      subtitle: 'Suzhou',
      description: 'Forty thousand square metres, and the oldest part of the company.'
    },
    {
      title: 'Crystal Shop',
      subtitle: 'Nanjing East Road, Shanghai',
      description: 'The three-floor flagship.'
    },
    {
      title: 'Service Network',
      subtitle: 'Every province we sell in',
      description: 'Authorised centres with one published price list between them.'
    },
    {
      title: 'Regional Offices',
      subtitle: 'Beijing, Guangzhou, Chengdu',
      description: 'Commercial and partner teams.'
    }
  ]
};

/* ------------------------------------------------------------------ */
/*  the certificates                                                  */
/* ------------------------------------------------------------------ */

export const CERTIFICATES = {
  TOP10: [
    {
      name: 'Top 10 IT Company',
      issuer: 'National Information Industry Council',
      year: 2023,
      description: 'Awarded on platform ownership, domestic research investment and export performance. Crystal is the only company on the list that also operates its own manufacturing.'
    }
  ],

  CORPORATE: [
    {
      name: 'ISO 9001 Quality Management',
      issuer: 'International Organization for Standardization',
      year: 2019,
      description: null
    },
    {
      name: 'ISO 14001 Environmental Management',
      issuer: 'International Organization for Standardization',
      year: 2020,
      description: null
    },
    {
      name: 'ISO 27001 Information Security',
      issuer: 'International Organization for Standardization',
      year: 2021,
      description: null
    },
    {
      name: 'High-Technology Enterprise',
      issuer: 'Ministry of Science and Technology',
      year: 2020,
      description: null
    },
    {
      name: 'National Software Enterprise',
      issuer: 'Software Industry Association',
      year: 2019,
      description: null
    },
    {
      name: 'Intellectual Property Management',
      issuer: 'State IP Administration',
      year: 2022,
      description: null
    },
    {
      name: 'Trusted Export Enterprise',
      issuer: 'Customs Administration',
      year: 2024,
      description: null
    }
  ],

  FACTORY_QA: [
    {
      name: 'IATF 16949 Automotive Quality',
      issuer: 'International Automotive Task Force',
      year: 2022,
      description: null
    },
    {
      name: 'IPC-A-610 Class 2 Assembly',
      issuer: 'IPC',
      year: 2018,
      description: null
    },
    {
      name: 'ISO 45001 Occupational Health',
      issuer: 'International Organization for Standardization',
      year: 2021,
      description: null
    },
    {
      name: 'RoHS Compliance',
      issuer: 'Notified Body',
      year: 2017,
      description: null
    },
    {
      name: 'REACH Compliance',
      issuer: 'Notified Body',
      year: 2019,
      description: null
    },
    {
      name: 'ESD S20.20 Static Control',
      issuer: 'ESD Association',
      year: 2020,
      description: null
    }
  ]
};

/* ------------------------------------------------------------------ */
/*  eleven years, as numbers                                          */
/* ------------------------------------------------------------------ */

/**
 * THE GROWTH FIGURES, one row per year since the company kept its factory.
 *
 * These are static for the same reason every other word here is: they change
 * once a year, when somebody closes the books and decides what to publish.
 * A console screen for a number that moves annually is a screen nobody
 * remembers how to use.
 *
 * `income` is in millions of dollars. Naming the unit here rather than in the
 * chart is deliberate - the axis label and the value have to agree, and they
 * cannot if each side decides its own scale.
 */
export const GROWTH = {
  unit: { people: 'people', income: '$m' },

  years: [
    { year: 2015, employees: 120, engineers: 18, income: 4.2 },
    { year: 2016, employees: 210, engineers: 34, income: 9.6 },
    { year: 2017, employees: 340, engineers: 61, income: 18.4 },
    { year: 2018, employees: 470, engineers: 95, income: 31.0 },
    { year: 2019, employees: 610, engineers: 134, income: 47.5 },
    { year: 2020, employees: 690, engineers: 168, income: 52.1 },
    { year: 2021, employees: 880, engineers: 214, income: 78.9 },
    { year: 2022, employees: 1120, engineers: 268, income: 104.3 },
    { year: 2023, employees: 1340, engineers: 312, income: 133.7 },
    { year: 2024, employees: 1580, engineers: 366, income: 168.2 },
    { year: 2025, employees: 1820, engineers: 412, income: 201.5 }
  ],

  /**
   * ONE CHART, THREE LINES, INDEXED TO THE FIRST YEAR.
   *
   * Employees are counted in thousands and income in hundreds of millions,
   * so these cannot share an axis of raw values - the smaller series would
   * lie flat along the bottom. A second y-axis is worse still: it decides
   * where the lines cross, so the reader sees a relationship that came from
   * the drawing rather than from the company.
   *
   * Drawing each series as a multiple of its own first year removes the
   * units, which is what makes one axis legitimate. GrowthSection carries
   * the full argument.
   *
   * `key` is the field, `label` names it, `prefix`/`suffix` are how a raw
   * value is written - the chart is multiples, but the legend and the table
   * are always the real figures.
   */
  series: [
    { key: 'employees', label: 'Employees', suffix: '' },
    { key: 'engineers', label: 'Engineers', suffix: '' },
    { key: 'income', label: 'Revenue', suffix: 'm', prefix: '$' }
  ]
};

/* ------------------------------------------------------------------ */
/*  static words, uploaded pictures                                   */
/* ------------------------------------------------------------------ */

/**
 * The page's data, assembled from this file and the image map the API serves.
 *
 * It returns EXACTLY the shape the section components already consume - the
 * same object the backend used to build out of three tables - so moving the
 * copy into code changed where the words come from and not one line of any
 * component. That is the whole reason this function exists rather than each
 * section importing SECTIONS itself.
 *
 * @param images  { slot: [{ src, dark, alt, caption }] } from GET /about
 * @param locale  which language to assemble; anything without a translation
 *                falls back to the English below rather than disappearing
 */
export function buildAbout(images, locale) {
  const pictures = images || {};

  /*
   * THE TRANSLATION IS MERGED HERE, once, rather than at every call site.
   *
   * Only the fields content.zh.js actually carries are replaced, so a chapter
   * translated except for one caption keeps the English caption instead of
   * losing it - and `slot`, `image`, `icon` and `link` are never touched,
   * because they are addresses rather than language.
   */
  const words = TRANSLATIONS[locale] || null;

  const say = (english, chinese) => {
    if (!words || !chinese) return english;
    return merge(english, chinese);
  };

  /** The first picture in a slot, in the shape the components expect. */
  const artOf = (slot) => {
    const found = slot ? (pictures[slot] || [])[0] : null;
    if (!found) return { image_desktop: null, image_mobile: null };

    /*
     * ONE FILE FOR BOTH BREAKPOINTS. There used to be a desktop and a mobile
     * column; the components still ask for both and get the same path,
     * because CSS crops it. Keeping the two prop names means ResponsiveMedia
     * did not have to change either.
     */
    return {
      image_desktop: found.src,
      image_mobile: found.src,
      image_desktop_dark: found.dark,
      image_mobile_dark: found.dark,
      image_alt: found.alt
    };
  };

  /**
   * AN ID FOR REACT TO KEY ON.
   *
   * These rows used to come out of three database tables and every component
   * keys its list on `.id`. Moving the copy into this file left the columns
   * behind, so every key on the About page was `undefined` - React fell back
   * to the array index and warned once per list, which is how it was noticed.
   *
   * Assigned here rather than written into the content, because an id is not
   * copy: it would have to be repeated in every translation and kept in step
   * by hand. Position is a sound identity for these lists - they are static,
   * ordered, and never filtered or reordered on screen.
   */
  const identify = (kind, row, index) => ({ id: kind + '-' + index, ...row });

  const at = (code) => {
    const copy = SECTIONS[code];
    if (!copy) return null;

    const said = say(copy, words && words.SECTIONS && words.SECTIONS[code]);

    /* A section already has a unique name of its own. */
    return { id: code, code, ...said, ...artOf(copy.slot) };
  };

  const of = (kind) => {
    const rows = ITEMS[kind] || [];
    const translated = words && words.ITEMS && words.ITEMS[kind];

    /*
     * BY POSITION, because these lists have no key of their own - a history
     * event is identified by where it sits in the decade. A translation
     * shorter than the English simply leaves the tail in English.
     */
    return rows.map((row, index) => identify(kind, say(row, translated && translated[index]), index));
  };

  const certs = (kind) => {
    const rows = CERTIFICATES[kind] || [];
    const translated = words && words.CERTIFICATES && words.CERTIFICATES[kind];
    return rows.map((row, index) => identify(kind, say(row, translated && translated[index]), index));
  };

  return {
    overview: at('OVERVIEW'),
    facts: of('FACT'),

    vision: at('VISION'),
    businesses: { overview: at('BUSINESSES'), items: of('BUSINESS') },

    recognition: {
      overview: at('RECOGNITION'),
      /* The one the chapter is built around: the first of its kind. */
      featured: certs('TOP10')[0] || null,
      certificates: certs('CORPORATE')
    },

    history: { overview: at('HISTORY'), events: of('HISTORY_EVENT') },

    /* The new band. Its picture is optional - the chart is the content. */
    growth: {
      ...GROWTH,

      /* The axis units and the legend are both read by the chart. */
      unit: say(GROWTH.unit, words && words.GROWTH && words.GROWTH.unit),
      series: GROWTH.series.map((entry, index) => say(
        entry,
        words && words.GROWTH && words.GROWTH.series && words.GROWTH.series[index]
      )),

      art: artOf('growth')
    },

    institute: { overview: at('INSTITUTE'), researchAreas: of('RESEARCH_AREA') },

    factory: {
      overview: at('FACTORY'),
      capabilities: of('FACTORY_CAPABILITY'),
      certificates: certs('FACTORY_QA'),
      /* The two gallery slots this chapter has, if they were uploaded. */
      gallery: (pictures['factory.floor'] || []).concat(pictures['factory.line'] || [])
    },

    manufacturing: {
      overview: at('MANUFACTURING'),
      capabilities: of('MANUFACTURING_CAPABILITY'),
      flow: of('MANUFACTURING_STAGE')
    },

    shop: {
      overview: at('SHOP'),
      /*
       * Ordered by the FLOOR, not by the order they are written in: a
       * building is read from the ground up.
       */
      floors: of('SHOP_FLOOR').slice().sort((a, b) => a.floor_number - b.floor_number),
      gallery: pictures['shop.interior'] || []
    },

    service: { overview: at('SERVICE'), services: of('SERVICE') },
    presence: { overview: at('PRESENCE'), locations: of('LOCATION') },

    /* Every scan the recognition and factory chapters open full size. */
    scans: pictures.certificate || []
  };
}
