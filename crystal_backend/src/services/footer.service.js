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
 * THE DEFAULT IS IN THE CODE AND IS A REAL FOOTER. A site whose settings row
 * has never been written still renders something sensible, and a document
 * that is missing a section falls back section by section rather than
 * collapsing to nothing - so a half-filled form can never take the footer
 * off the site.
 */

const KEY = 'site.footer';

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
     */
    phones: [
      '400-820-1668',
      '0755-8666-1000',
      '0755-8666-1001',
      '0755-8666-1002',
      '0755-8666-1003',
      '138-2688-1000',
      '139-2688-1001'
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
      /* Strings, and blank ones are dropped - an empty row in the form is
         somebody who deleted a number, not a number that is empty. */
      phones: listOf(doc.contacts && doc.contacts.phones, DEFAULT.contacts.phones)
        .map(function (phone) { return String(phone).trim(); })
        .filter(Boolean)
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

module.exports = { KEY: KEY, DEFAULT: DEFAULT, merge: merge, get: get };
