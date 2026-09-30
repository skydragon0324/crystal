'use strict';

const settings = require('./settings.service');

/**
 * THE FOOTER, which the operations console owns rather than the code.
 *
 * Every item on it - the app downloads, the phone numbers, the support links,
 * the company's address, and the two site buttons in the corner - is content
 * somebody in the business changes, not something a release should be cut
 * for. A phone number that moved is not a deployment.
 *
 * It is ONE SETTING holding one JSON document rather than twenty keys.
 * Three of the four sections are LISTS of unknown length - six or seven phone
 * numbers today, five tomorrow - and a key-per-value store cannot express
 * that without inventing `footer.phone_4` and a rule for what happens when
 * somebody clears it.
 *
 * A NUMBER IS `{ label, number }`, and a bare string is still read - see
 * `phoneOf` below. The labels are what tells the 400 service line from the
 * wholesale desk, and a site that saved its footer before labels existed
 * keeps every number it had.
 *
 * THE DEFAULT IS IN THE CODE AND IS A REAL FOOTER. A site whose settings row
 * has never been written still renders something sensible, and a document
 * that is missing a section falls back section by section rather than
 * collapsing to nothing - so a half-filled form can never take the footer
 * off the site.
 */

const KEY = 'site.footer';
const PAGE = '/admin/base/footer';

/**
 * What the footer says before anybody has edited it.
 *
 * The links point at pages this site actually has. The two site buttons are
 * deliberately placeholders - they are for wherever this deployment wants to
 * send people, and inventing a destination for them here would be a guess
 * shown to every visitor.
 */
const DEFAULT = {
  downloads: {
    title: 'Downloads',
    items: [
      { label: 'Crystal App', href: '/downloads/crystal-app.apk' },
      { label: 'Eshop App', href: '/downloads/eshop-app.apk' },
      { label: 'Appstore App', href: '/downloads/appstore-app.apk' }
    ]
  },
  contacts: {
    title: 'Contact us',
    /*
     * CHINESE NUMBERS, in the shapes China actually uses - a 400 service
     * line, Shenzhen landlines on the 0755 code to match the address above,
     * and two mobiles. A number is a place to ring rather than prose, so it
     * is written the way the country it rings writes it.
     *
     * The storefront and the shared chrome both strip everything but digits
     * for the `tel:` href, so the grouping here is only for reading.
     *
     * EACH ONE SAYS WHAT IT IS. Seven numbers under one heading are seven
     * identical stripes of digits, and a visitor who wants the service line
     * rings the wholesale desk. The label is DATA - somebody in the business
     * types it in the console and it is never translated, the same as the
     * address above - so these are only what a fresh install starts with.
     */
    phones: [
      { label: 'Service line', number: '400-820-1668' },
      { label: 'Sales', number: '0755-8666-1000' },
      { label: 'Head office', number: '0755-8666-1001' },
      { label: 'After-sales', number: '0755-8666-1002' },
      { label: 'Wholesale', number: '0755-8666-1003' },
      { label: 'Sales, mobile', number: '138-2688-1000' },
      { label: 'Support, mobile', number: '139-2688-1001' }
    ]
  },
  support: {
    title: 'Support',
    links: [
      { label: 'FAQ', to: '/support/faq' },
      { label: 'Contact us', to: '/support/contact' }
    ]
  },
  company: {
    title: 'Crystal',
    email: 'admin@crystal.example',
    /*
     * A CHINESE ADDRESS, like the eshop's delivery addresses in the mock.
     *
     * It is a PLACE, not prose in a language - so it is written the way the
     * country it is in writes it, and it is not translated. Everything else
     * in this default is a label the frontends run through t().
     */
    address: '中国 广东省 深圳市 南山区 科技园南路 55 号 晶石电子大厦'
  },
  sites: [
    { label: 'Site A', href: '' },
    { label: 'Site B', href: '' }
  ]
};

/**
 * ONE NUMBER, out of a document from either era.
 *
 * LABELS ARRIVED AFTER THE FIRST FOOTERS WERE SAVED. A row written before
 * them is a bare string - '400-820-1668' - and one written since is
 * { label, number }. BOTH ARE READ, and both come out as { label, number },
 * so nothing downstream has to know which era a site's settings row is from.
 * An old document keeps every number it had and simply has no label to show
 * beside them; it does not render blank, and nobody has to open the console
 * to get their footer back.
 */
function phoneOf(held) {
  const row = held && typeof held === 'object' ? held : { number: held };
  const text = function (value) { return String(value == null ? '' : value).trim(); };

  return { label: text(row.label), number: text(row.number) };
}

/** A list from the document, or the default's - never undefined. */
function listOf(held, fallback) {
  return Array.isArray(held) ? held.filter(Boolean) : fallback;
}

/**
 * The document, merged over the default SECTION BY SECTION.
 *
 * A shallow `Object.assign` would let a document that names only `company`
 * blank the other three, which is what a half-saved form produces. Each part
 * falls back on its own.
 */
function merge(held) {
  const doc = held && typeof held === 'object' ? held : {};

  return {
    downloads: {
      title: (doc.downloads && doc.downloads.title) || DEFAULT.downloads.title,
      items: listOf(doc.downloads && doc.downloads.items, DEFAULT.downloads.items)
    },
    contacts: {
      title: (doc.contacts && doc.contacts.title) || DEFAULT.contacts.title,
      /* Blank ones are dropped - an empty row in the form is somebody who
         deleted a number, not a number that is empty. A label with no number
         is nothing to ring, so it goes the same way. */
      phones: listOf(doc.contacts && doc.contacts.phones, DEFAULT.contacts.phones)
        .map(phoneOf)
        .filter(function (phone) { return phone.number; })
    },
    support: {
      title: (doc.support && doc.support.title) || DEFAULT.support.title,
      links: listOf(doc.support && doc.support.links, DEFAULT.support.links)
    },
    company: {
      title: (doc.company && doc.company.title) || DEFAULT.company.title,
      email: (doc.company && doc.company.email) || DEFAULT.company.email,
      address: (doc.company && doc.company.address) || DEFAULT.company.address
    },
    /*
     * The two corner buttons. A button with no destination is not rendered -
     * see the storefront - but it is kept here so the console still has a row
     * to type into.
     */
    sites: listOf(doc.sites, DEFAULT.sites).slice(0, 2)
  };
}

/** What the storefront renders. Public, unauthenticated, cached upstream. */
async function get() {
  return merge(await settings.value(KEY, null));
}

/** Save from the dedicated footer editor, then return the normalised document
 * that both public clients receive. */
async function save(document, actor) {
  const held = document && typeof document === 'object' && !Array.isArray(document) ? document : {};
  await settings.set(KEY, JSON.stringify(held), actor, PAGE);
  return get();
}

module.exports = {
  KEY: KEY,
  PAGE: PAGE,
  DEFAULT: DEFAULT,
  phoneOf: phoneOf,
  merge: merge,
  get: get,
  save: save
};
