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
 * A company introduction is not content that turns over: it is the company's
 * own account of itself, rewritten every few years by somebody who cares about
 * the wording. So it lives here, under review like every other line.
 *
 * THE PICTURES ARE BUILD ASSETS in images.js, keyed by SLOT. Every
 * `slot: '...'` in this file is a place the page asks for a picture, and
 * `buildAbout()` marries the reviewed copy to the reviewed file.
 *
 * A SLOT IS WRITTEN OUT IN FULL, never assembled from a key, so the asset map
 * and its tests can prove that every reference has a matching local file.
 *
 * A SLOT CAN HOLD SEVERAL PICTURES. Where the page shows a carousel - a shop
 * floor, a technology's certificates - every active row in that slot is a
 * slide, in array order. Everywhere else the first one is used.
 *
 * DESCRIPTIONS KEEP THEIR LINE BREAKS, and accept two marks:
 *
 *   <strong>Four hundred engineers</strong>   bold, at the text's own size
 *   <big>Crystal</big>                         bold AND larger - for the name
 *
 * That is all the markup they accept - see components/Prose.js, which
 * escapes everything else - so a paragraph break is an Enter in the string
 * rather than a second field.
 */

/* ------------------------------------------------------------------ */
/*  the chapters                                                       */
/* ------------------------------------------------------------------ */

/**
 * One entry per band. `slot` names the chapter's own picture, or null for a
 * chapter that has none.
 */
export const SECTIONS = {
  OVERVIEW: {
    eyebrow: 'About Crystal',
    title: 'Technology. Manufacturing. Commerce.',
    subtitle: null,
    description: '<big>Crystal</big> designs and builds the electronics it sells. Smartphones on our own silicon, televisions and set-top boxes on the same operating system, and the factory, the institute and the service network that stand behind all of them.\n\nEleven years ago we assembled set-top boxes for other companies. We kept the factory, learned to write the software, and stopped putting somebody else\'s name on the box.',
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
    title: 'Five businesses, one company.',
    subtitle: 'From the silicon in a handset to the shelf it is sold from.',
    description: null,
    slot: null
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
    description: '<strong>Four hundred engineers</strong> in Shanghai and Hangzhou. The institute owns <strong>Crystal OS</strong>, the imaging pipeline, the Halo and Nova platforms, and the connected-device stack that ties a television to a handset.\n\nIt is slower than buying a reference design, and it is the reason a camera behaves the same on a C5 as on a C9.',
    slot: 'institute'
  },

  /*
   * Inside the Institute chapter: the technologies Crystal develops itself,
   * as a list of titles beside ONE carousel of the certificates behind them.
   * There are fewer certificates than technologies, so a carousel per row
   * would leave most rows with an empty frame - the certificates are the
   * block's, not any one line's.
   */
  TECHNOLOGY: {
    eyebrow: 'Our own technology',
    title: 'Built in-house, certified independently.',
    subtitle: 'The platforms and protections Crystal develops itself.',
    description: null,
    slot: 'institute.technology'
  },

  FACTORY: {
    eyebrow: 'Where we manufacture',
    title: 'Eproduct Factory',
    subtitle: 'Quality built into every product.',
    description: 'Forty thousand square metres outside Suzhou, and the oldest part of this company. Surface mount, assembly, functional test and packaging happen under one roof, which is what lets a fault found in testing reach the line that caused it the same afternoon.',
    slot: 'factory'
  },

  /* Inside the Factory chapter: what happens in the building. */
  MANUFACTURING: {
    eyebrow: 'How we manufacture',
    title: 'Six steps from components to a sealed box.',
    subtitle: 'Every one of them measured, and a failure goes back to the step that caused it.',
    description: null,
    slot: null
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
    description: null,
    slot: 'service'
  },

  PRESENCE: {
    eyebrow: 'Where we are',
    title: 'Crystal Presence',
    subtitle: 'Connecting people through technology.',
    description: null,
    slot: null
  }
};

/* ------------------------------------------------------------------ */
/*  the lists inside them                                             */
/* ------------------------------------------------------------------ */

export const ITEMS = {
  /*
   * THREE MILESTONES: the year, and the name the company took in it. The value
   * is the year and the title is the name, so the big figure on the page is
   * the date and the name is read under it.
   */
  FACT: [
    { title: 'Crystal Company', value: '2015' },
    { title: 'Crystal Corp', value: '2018' },
    { title: 'Crystal Group', value: '2024' }
  ],

  /*
   * THE TITLE AND NOTHING ELSE. Each business is a word in a hexagon, five in
   * a row - what the company does, at a glance, rather than seven cards of
   * copy a reader skims past.
   */
  BUSINESS: [
    { title: 'Smartphone' },
    { title: 'Eproduct' },
    { title: 'Software' },
    { title: 'Print' },
    { title: 'Commerce' }
  ],

  /*
   * A YEAR AND WHAT HAPPENED IN IT. The description is the whole entry, and it
   * keeps its line breaks - so the first line reads as the headline and the
   * rest as the story, without a separate title field to keep in step.
   */
  HISTORY_EVENT: [
    { year: 2016, description: 'Crystal is founded.\nSixteen people outside Suzhou, assembling set-top boxes for other companies.' },
    { year: 2017, description: 'The factory doubles.\nA second line, and the first quality system worth the name. We stop losing money on rework.' },
    { year: 2018, description: 'The first Crystal handset.\nThe C1 ships. It is unremarkable, and it teaches us how to build a supply chain.' },
    { year: 2019, description: 'Crystal OS 1.0.\nWe stop shipping somebody else\'s software and start shipping our own.' },
    { year: 2020, description: 'The IT Institute opens.\nEighty engineers in Shanghai, with a mandate to own the platform rather than license it.' },
    { year: 2021, description: 'The service network.\nAuthorised centres in nine provinces, with one published price list between them.' },
    { year: 2022, description: 'Crystal Vision.\nTelevisions and the karaoke stack, built on the same operating system as the phones.' },
    { year: 2023, description: 'Top 10 IT company.\nIndependent recognition of the platform work, eight years after the first line started.' },
    { year: 2024, description: 'The Halo platform.\nIn-house silicon. The C9 line is the first to carry it.' },
    { year: 2025, description: 'The three-floor shop.\nNanjing East Road opens: the range, the living room and the repair counter under one roof.' },
    { year: 2026, description: 'Five-year updates on everything.\nIncluding the C3 at 179 dollars, which costs us more per device than the flagship.' }
  ],

  RESEARCH_AREA: [
    {
      title: 'Software Development',
      description: 'Crystal OS, the update pipeline, and the services behind both.',
      icon: 'FiCode',
      slot: 'institute.research.software'
    },
    {
      title: 'Mobile Technology',
      description: 'Radio, power and thermal work on the Halo and Nova platforms.',
      icon: 'FiSmartphone',
      slot: 'institute.research.mobile'
    },
    {
      title: 'Crystal OS',
      description: 'One operating system across handsets, televisions and set-top boxes.',
      icon: 'FiLayers',
      slot: 'institute.research.crystal-os'
    },
    {
      title: 'Imaging and AI',
      description: 'The camera pipeline, and the on-device models that run inside it.',
      icon: 'FiCpu',
      slot: 'institute.research.imaging'
    },
    {
      title: 'IoT and Connected Devices',
      description: 'How a television, a handset and a set-top box find each other on a home network.',
      icon: 'FiWifi',
      slot: 'institute.research.iot'
    },
    {
      title: 'Security and Updates',
      description: 'Five years of patches on every model, and the infrastructure that delivers them.',
      icon: 'FiShield',
      slot: 'institute.research.security'
    }
  ],

  /* The titles only; the certificates are one carousel beside the list. */
  TECHNOLOGY: [
    { title: 'Crystal OS' },
    { title: 'SmartTV OS' },
    { title: 'Computer BIOS' },
    { title: 'Camera Security' },
    { title: 'Print Authentication' },
    { title: 'exFAT Firmware' },
    { title: 'Cordless Phone Encryption' }
  ],

  /* Six steps, in order. Read left to right, then down. */
  MANUFACTURING_FLOW: [
    {
      title: 'Components',
      description: 'Incoming inspection, and a reel that fails it never reaches a line.',
      slot: 'factory.flow.components'
    },
    {
      title: 'SMT',
      description: 'Six surface-mount lines with automated optical inspection between every stage.',
      slot: 'factory.flow.smt'
    },
    {
      title: 'Assembly',
      description: 'Display bonding, battery, housing and the seals that decide an ingress rating.',
      slot: 'factory.flow.assembly'
    },
    {
      title: 'Functional Testing',
      description: 'Every radio, every sensor, every port, on every unit - not on a sample.',
      slot: 'factory.flow.testing'
    },
    {
      title: 'Quality Assurance',
      description: 'A sampling plan per model, and a failure that stops the line rather than filling a report.',
      slot: 'factory.flow.qa'
    },
    {
      title: 'Packaging',
      description: 'Printed, assembled and filled in-house - which is why a box arrives with the device rather than three weeks after it.',
      slot: 'factory.flow.packaging'
    }
  ],

  /* Each floor shows several pictures, as a carousel. */
  SHOP_FLOOR: [
    {
      title: 'The range',
      subtitle: 'First floor',
      description: 'Every current handset, set up and signed in, with the accessories that go with them. Buy, or bring a device in and have it set up here.',
      floor: 1,
      slot: 'shop.floor.1'
    },
    {
      title: 'The living room',
      subtitle: 'Second floor',
      description: 'Televisions, set-top boxes, cameras and the karaoke stack, in rooms built to look like rooms rather than like shelves.',
      floor: 2,
      slot: 'shop.floor.2'
    },
    {
      title: 'The service counter',
      subtitle: 'Third floor',
      description: 'A full authorised service centre: repairs, warranty, OS installs and device registration. Walk in.',
      floor: 3,
      slot: 'shop.floor.3'
    }
  ],

  SERVICE: [
    {
      title: 'Smartphone Repair',
      description: 'Screens, batteries, ports and boards.\nEvery price is published before you need it.',
      icon: 'FiSmartphone'
    },
    {
      title: 'Eproduct Repair',
      description: 'Televisions, set-top boxes, computers and cameras.\nHandled at the centres that list them.',
      icon: 'FiTv'
    },
    {
      title: 'Software Service',
      description: 'Crystal OS installs and recovery.\nWhile you wait, at any authorised centre.',
      icon: 'FiDownloadCloud'
    },
    {
      title: 'Warranty',
      description: 'Registered to your account rather than to a receipt you have to keep.',
      icon: 'FiShield'
    },
    {
      title: 'Crystal Care+',
      description: 'Accidental damage cover.\nBought at any time while the device is still under warranty.',
      icon: 'FiUmbrella'
    }
  ],

  /* Two places, each with its own photograph. */
  LOCATION: [
    {
      title: 'Crystal Headquarters',
      subtitle: 'Shanghai',
      description: 'Head office and the commercial businesses.',
      slot: 'presence.headquarters'
    },
    {
      title: 'Crystal Shop',
      subtitle: 'Nanjing East Road, Shanghai',
      description: 'The three-floor flagship.',
      slot: 'presence.shop'
    }
  ]
};

/* ------------------------------------------------------------------ */
/*  the certificates                                                  */
/* ------------------------------------------------------------------ */

/**
 * Each certificate names the slot of its bundled scan. A certificate with no
 * local scan still shows as its name on a tinted card.
 */
export const CERTIFICATES = {
  CORPORATE: [
    {
      name: 'ISO 9001 Quality Management',
      issuer: 'International Organization for Standardization',
      year: 2019,
      slot: 'recognition.certificate.iso-9001'
    },
    {
      name: 'ISO 14001 Environmental Management',
      issuer: 'International Organization for Standardization',
      year: 2020,
      slot: 'recognition.certificate.iso-14001'
    },
    {
      name: 'ISO 27001 Information Security',
      issuer: 'International Organization for Standardization',
      year: 2021,
      slot: 'recognition.certificate.iso-27001'
    },
    {
      name: 'High-Technology Enterprise',
      issuer: 'Ministry of Science and Technology',
      year: 2020,
      slot: 'recognition.certificate.high-tech'
    },
    {
      name: 'National Software Enterprise',
      issuer: 'Software Industry Association',
      year: 2019,
      slot: 'recognition.certificate.software-enterprise'
    },
    {
      name: 'Intellectual Property Management',
      issuer: 'State IP Administration',
      year: 2022,
      slot: 'recognition.certificate.ip-management'
    },
    {
      name: 'Trusted Export Enterprise',
      issuer: 'Customs Administration',
      year: 2024,
      slot: 'recognition.certificate.trusted-export'
    }
  ],

  FACTORY_QA: [
    {
      name: 'IATF 16949 Automotive Quality',
      issuer: 'International Automotive Task Force',
      year: 2022,
      slot: 'factory.certificate.iatf-16949'
    },
    {
      name: 'IPC-A-610 Class 2 Assembly',
      issuer: 'IPC',
      year: 2018,
      slot: 'factory.certificate.ipc-a-610'
    },
    {
      name: 'ISO 45001 Occupational Health',
      issuer: 'International Organization for Standardization',
      year: 2021,
      slot: 'factory.certificate.iso-45001'
    },
    {
      name: 'RoHS Compliance',
      issuer: 'Notified Body',
      year: 2017,
      slot: 'factory.certificate.rohs'
    },
    {
      name: 'REACH Compliance',
      issuer: 'Notified Body',
      year: 2019,
      slot: 'factory.certificate.reach'
    },
    {
      name: 'ESD S20.20 Static Control',
      issuer: 'ESD Association',
      year: 2020,
      slot: 'factory.certificate.esd-s20-20'
    }
  ]
};

/* ------------------------------------------------------------------ */
/*  eleven years, as numbers                                          */
/* ------------------------------------------------------------------ */

/**
 * THE GROWTH FIGURES - and THIS IS WHERE TO CHANGE THEM.
 *
 * One row per year. The chart on /about is drawn from these rows and nothing
 * else: add next year's row at the bottom and the chart gains a point, change
 * a figure and its line moves. There is no table on the page any more, so
 * these are the only copy of the numbers anywhere.
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
   * ONE CHART, THREE LINES, INDEXED TO THE FIRST YEAR - see GrowthSection for
   * why. `key` is the field, `label` names it, `prefix`/`suffix` are how a raw
   * value is written in the legend.
   */
  series: [
    { key: 'employees', label: 'Employees', suffix: '' },
    { key: 'engineers', label: 'Engineers', suffix: '' },
    { key: 'income', label: 'Revenue', suffix: 'm', prefix: '$' }
  ]
};

/* ------------------------------------------------------------------ */
/*  static words and bundled pictures                                 */
/* ------------------------------------------------------------------ */

/**
 * The page's data, assembled from this file and the imported image map.
 *
 * @param images  { slot: [{ src, dark, alt, caption }] } from images.js
 * @param locale  which language to assemble; anything without a translation
 *                falls back to the English above rather than disappearing
 */
export function buildAbout(images, locale) {
  const pictures = images || {};
  const words = TRANSLATIONS[locale] || null;

  const say = (english, translated) => {
    if (!words || !translated) return english;
    return merge(english, translated);
  };

  /** Every picture in a slot, in order - a carousel's slides. */
  const picturesOf = (slot) => (slot ? pictures[slot] || [] : []);

  /**
   * The FIRST picture in a slot, as the fields the components read.
   *
   * THIS USED TO RUN FOR CHAPTERS ONLY. Items carried the slot's name in an
   * `image` field that nothing ever looked up, so a business, a history year,
   * a factory block or a certificate showed no picture from its slot. Every row with a
   * `slot` goes through here now.
   */
  const artOf = (slot) => {
    const found = picturesOf(slot)[0];
    if (!found) return { image_desktop: null, image_mobile: null };

    /* One file for both breakpoints; CSS crops it. */
    return {
      image_desktop: found.src,
      image_mobile: found.src,
      image_desktop_dark: found.dark,
      image_mobile_dark: found.dark,
      image_alt: found.alt
    };
  };

  /** The picture fields for a row that names a slot, or nothing. */
  const withPictures = (row) => (row.slot
    ? { ...row, ...artOf(row.slot), images: picturesOf(row.slot) }
    : row);

  /*
   * An id for React to key on. Position is a sound identity for these lists:
   * they are static, ordered, and never filtered or reordered on screen.
   */
  const identify = (kind, row, index) => ({ id: kind + '-' + index, ...row });

  const at = (code) => {
    const copy = SECTIONS[code];
    if (!copy) return null;

    const said = say(copy, words && words.SECTIONS && words.SECTIONS[code]);
    /* `images` too: a chapter-level slot can be a carousel (the technology block). */
    return { id: code, code, ...said, ...artOf(copy.slot), images: picturesOf(copy.slot) };
  };

  /* By position: a translation shorter than the English leaves the tail in English. */
  const of = (kind) => {
    const rows = ITEMS[kind] || [];
    const translated = words && words.ITEMS && words.ITEMS[kind];

    return rows.map((row, index) => identify(
      kind,
      withPictures(say(row, translated && translated[index])),
      index
    ));
  };

  const certs = (kind) => {
    const rows = CERTIFICATES[kind] || [];
    const translated = words && words.CERTIFICATES && words.CERTIFICATES[kind];

    return rows.map((row, index) => {
      const said = say(row, translated && translated[index]);
      /* CertificateGrid reads `image`: the locally bundled scan. */
      const scan = picturesOf(row.slot)[0];
      return identify(kind, { ...said, image: scan ? scan.src : null }, index);
    });
  };

  return {
    overview: at('OVERVIEW'),
    facts: of('FACT'),

    vision: at('VISION'),
    businesses: { overview: at('BUSINESSES'), items: of('BUSINESS') },

    growth: {
      ...GROWTH,
      unit: say(GROWTH.unit, words && words.GROWTH && words.GROWTH.unit),
      series: GROWTH.series.map((entry, index) => say(
        entry,
        words && words.GROWTH && words.GROWTH.series && words.GROWTH.series[index]
      ))
    },

    recognition: { overview: at('RECOGNITION'), certificates: certs('CORPORATE') },

    history: { overview: at('HISTORY'), events: of('HISTORY_EVENT') },

    institute: {
      overview: at('INSTITUTE'),
      researchAreas: of('RESEARCH_AREA'),
      technology: { overview: at('TECHNOLOGY'), items: of('TECHNOLOGY') }
    },

    factory: {
      overview: at('FACTORY'),
      manufacturing: { overview: at('MANUFACTURING'), flow: of('MANUFACTURING_FLOW') },
      certificates: certs('FACTORY_QA')
    },

    shop: {
      overview: at('SHOP'),
      /* A building is read from the ground up. */
      floors: of('SHOP_FLOOR').slice().sort((a, b) => a.floor - b.floor)
    },

    service: { overview: at('SERVICE'), services: of('SERVICE') },
    presence: { overview: at('PRESENCE'), locations: of('LOCATION') }
  };
}
