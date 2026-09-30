import { centresPathOf } from '@/components/support/serviceSections';

/**
 * Numbers and links the header, the mobile sheet and the sticky account
 * sidebar all depend on.
 *
 * The header height is hard-coded in ONE place because three components need
 * it and none of them can measure it: the sheet unrolls from under the
 * header, the account sidebar sticks below it, and in-page anchors offset by
 * it. Declaring it three times is how those drift apart.
 *
 * 60px, everywhere. It was 92px on a desktop, because a 32px announcement
 * strip sat above the bar - that strip is gone, and the three components
 * that stick to this moved with it rather than each keeping its own memory
 * of a header that is no longer that tall.
 */
export const HEADER_HEIGHT = { base: '60px', md: '60px' };
export const HEADER_BAR_HEIGHT = '60px';

/** External destinations (spec 1.1: the Eshop and Appstore are separate). */
export const EXTERNAL = {
  eshop: 'https://eshop.crystal.example',
  appstore: 'https://appstore.crystal.example'
};

/**
 * THE SITE MENU. ONE LIST, AND BOTH THE DESKTOP AND THE PHONE DRAW IT.
 *
 * There used to be three: PRIMARY_LINKS for the desktop bar, a column builder
 * in siteMenu.js for the desktop panel, and MOBILE_NAV for the phone sheet.
 * They agreed on the day they were written and then drifted, one request at a
 * time, until the same site had two menus: on a phone the Eshop was a branch
 * holding the member's Eshop pages and a link out to the store; on a desktop
 * it was a bare link that left the site, and the panel under it listed live
 * catalogue categories the phone had never shown and a "Shop" column the
 * phone did not have. Nothing failed, because nothing compared them.
 *
 * THE PHONE'S MENU IS THE ONE KEPT - it is what the member asked the desktop
 * to follow - and it now lives here, once. Header.js draws its bar and its
 * panel from this list; MobileNav.js draws its sheet from this list; and
 * tests/menuParity.test.js mounts both and fails the moment what they draw is
 * not this. Change the menu HERE, and both change.
 *
 * WHICH SURFACE AN ENTRY IS ON is two flags, both opt-out:
 *
 *   bar: false     not a heading in the desktop bar
 *   phone: false   not a row in the phone sheet
 *
 * A branch with both off is a PANEL-ONLY column - Shop is one, holding the
 * two stores for somebody browsing the desktop menu, where the bar already
 * carries them as links. Nothing is hidden from a reader by these: every
 * address in this list is reachable on every device, and the flags only say
 * where a menu repeats itself.
 *
 * An entry is one of three things:
 *
 *   a BRANCH  { key, label, links }   a chevron row on the phone that opens
 *                                     to its links; a heading on the desktop
 *                                     that opens the panel, where its links
 *                                     are a column
 *   a LEAF    { key, label, to }      a row / heading that goes straight there
 *   a STORE   { key, label, href,     the same, to another site: the Eshop and
 *               external: true }      the Appstore, drawn WITHOUT an
 *                                     external-link icon (see below)
 *
 * A link inside a branch is { label, to } for a page here, or { label, href,
 * external: true } for a row that leaves - which does carry the icon, because
 * one row leaving a list of pages on this site is worth marking.
 *
 * IT IS STATIC, AND THAT IS NOT AN ACCIDENT OF THE PHONE. A menu that waits on
 * `GET /categories` opens EMPTY on the click that opened it, and the desktop
 * panel had a skeleton for exactly that. This is the navigation SKELETON - the
 * pages that exist whatever the catalogue holds - and every branch ends at a
 * landing page that lists the live data itself. That is also why Eproducts
 * does not name its sections here: they are rows in `product_categories` and
 * they change; /eproducts lists them from the API (development rule 1).
 *
 * The order is the spec's, top to bottom. The account row that opens the
 * phone's list is NOT in here: it is the one entry that depends on who is
 * looking, so MobileNav renders it above these and the desktop keeps it at
 * the right-hand end of the bar.
 */
export const SITE_NAV = [
  {
    key: 'smartphones',
    label: 'Smartphones',
    /* The section's own address: "you are here" in the bar, and the row below. */
    section: '/smartphones',
    sectionLabel: 'Overview',
    links: [
      { label: 'All smartphones', to: '/smartphones/products' },
      { label: 'Compare phones', to: '/smartphones/compare' },
      /* The handset counter, in the handset menu - not behind Support. */
      { label: 'Service centres', to: centresPathOf('SMARTPHONE') },
      { label: 'Crystal OS', to: '/support/os' }
    ]
  },
  {
    key: 'eproducts',
    label: 'Eproducts',
    section: '/eproducts',
    sectionLabel: 'Overview',
    links: [
      { label: 'All eproducts', to: '/eproducts' },
      { label: 'Service centres', to: centresPathOf('EPRODUCT') }
    ]
  },
  /*
   * THE TWO STORES ARE ONE LINK EACH, AND THEY LEAVE.
   *
   * They were briefly branches holding the member's own Eshop and Appstore
   * pages - cards, orders, purchases, the wallet. That is not what the
   * headings are for: those pages belong to the member and are in the account
   * menu, where somebody signed in looks for them, and repeating them in the
   * site menu made two ways to the same screens and a menu that opened when a
   * reader expected to arrive at the shop.
   *
   * NO EXTERNAL-LINK ICON. Both stores are Crystal to the people using them,
   * and a mark that says "you are leaving" on the two commercial headings
   * reads as a warning about Crystal's own shops.
   */
  { key: 'eshop', label: 'Eshop', href: EXTERNAL.eshop, external: true },
  { key: 'appstore', label: 'Appstore', href: EXTERNAL.appstore, external: true },
  /*
   * SHOP IS A COLUMN IN THE PANEL AND NOTHING ELSE.
   *
   * The panel opens under headings a reader is already browsing, and the
   * two shops belong in that view of the site; the bar carries them as
   * links of their own, so a heading here would be the same word twice,
   * and the phone sheet lists them as rows for the same reason.
   */
  {
    key: 'shop',
    label: 'Shop',
    bar: false,
    phone: false,
    links: [
      { label: 'Eshop', href: EXTERNAL.eshop, external: true },
      { label: 'Appstore', href: EXTERNAL.appstore, external: true }
    ]
  },
  {
    key: 'support',
    label: 'Support',
    section: '/support',
    /*
     * SUPPORT IS NOT A HEADING IN THE DESKTOP BAR, and it is still a branch.
     *
     * "Remove the support header button" was asked for while the pages are
     * not ready to be advertised, and the pages were kept rather than deleted
     * so that putting the button back is this one line. It stays a column in
     * the desktop panel and a row on the phone, as it always has been - the
     * bar is the only place it is missing, and this flag is the only
     * difference between the two menus that the parity test permits.
     *
     * TWO LINKS FOR NOW. The pricing, warranty and support-home pages are
     * finished but not ready to be advertised, so nothing points at them
     * while that is true - /support in particular is linked from nowhere now.
     * They are pages, not rows here, and adding one back is a line.
     */
    bar: false,
    /*
     * AND NOT ON THE PHONE EITHER. It is not a heading in the bar, so a
     * row on the phone made the two menus disagree in the one direction
     * the phone was supposed to be the reference for - and the footer,
     * which every page ends with, carries these two links already.
     */
    phone: false,
    links: [
      { label: 'FAQ', to: '/support/faq' },
      { label: 'Contact us', to: '/support/contact' }
    ]
  },
  { key: 'blog', label: 'Blog', to: '/blog' },
  { key: 'about', label: 'About', to: '/about' }
];

/** The headings in the desktop bar: every entry, in order, but those kept out of it. */
export const SITE_BAR = SITE_NAV.filter((entry) => entry.bar !== false);

/** The rows in the phone's sheet, in order. */
export const SITE_PHONE = SITE_NAV.filter((entry) => entry.phone !== false);

/** The columns of the desktop panel: every entry that opens to links. */
export const SITE_BRANCHES = SITE_NAV.filter((entry) => !!entry.links);

/** The branches the phone can drill into - the panel's columns, less the panel-only ones. */
export const PHONE_BRANCHES = SITE_BRANCHES.filter((entry) => entry.phone !== false);

/**
 * THE ROWS OF ONE BRANCH - its own links, and the section's own page first.
 *
 * A heading in the bar opens the panel; it does not go anywhere, because it
 * has to stay a button that a keyboard can open and close. That left
 * /smartphones - the section's own page, the one the homepage's "See all"
 * leads to - reachable from nowhere in either menu.
 *
 * So the section becomes the FIRST ROW of its own column, on the desktop and
 * on the phone alike, which is why both renderers read this rather than
 * `entry.links` and why the two menus still agree.
 *
 * It is opt-in, through `sectionLabel`, and it is skipped when a row already
 * leads there: Eproducts' own "All eproducts" IS /eproducts, and Support has
 * no label here on purpose - /support is finished but not advertised yet, and
 * nothing is to link to it.
 */
export function branchLinks(entry) {
  const links = (entry && entry.links) || [];
  if (!entry || !entry.section || !entry.sectionLabel) return links;

  const already = links.some((link) => !link.external && pathOf(link.to) === entry.section);
  if (already) return links;

  return [{ label: entry.sectionLabel, to: entry.section }].concat(links);
}

/** Only the path of an address - a link may carry a preset query. */
function pathOf(to) {
  return String(to || '').split('?')[0];
}

/**
 * The entry the reader is in, for the desktop bar's "you are here".
 *
 * THE LONGEST MATCHING ADDRESS WINS, which is what keeps the borrowed pages
 * where they are filed: /support/os and the handset service centres are under
 * /support, and they belong to Smartphones because that branch lists them.
 *
 * The two stores match nothing here: they are somewhere else, and no page on
 * this site is "inside" them.
 */
export function currentEntry(pathname) {
  let best = null;
  let bestLength = -1;

  SITE_NAV.forEach((entry) => {
    const paths = []
      .concat(entry.to ? [entry.to] : [])
      .concat(entry.section ? [entry.section] : [])
      .concat((entry.links || []).filter((link) => !link.external).map((link) => link.to));

    paths.forEach((to) => {
      const path = pathOf(to);
      const inside = pathname === path || pathname.indexOf(path + '/') === 0;
      if (inside && path.length > bestLength) {
        best = entry.key;
        bestLength = path.length;
      }
    });
  });

  return best;
}
