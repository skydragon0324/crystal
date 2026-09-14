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

/*
 * The top-level bar, left of the utilities.
 *
 * EVERY ONE OF THESE OPENS A PANEL, which is what `menu` names.
 *
 * Only Smartphones and Eproducts used to react to the pointer, and a bar
 * that answers a hover on two of its six entries reads as broken on the
 * other four - the visitor learns it is not hoverable and stops trying.
 *
 * THE TWO STORES STILL GO TO THE STORES. They carry `menu` so the panel
 * opens under them like everything else, and `href` so following them lands
 * where the label says. Pointing them at the member's own Eshop pages was
 * tried and is wrong twice over: the label says Eshop and it is what a
 * visitor with no account clicks first.
 */
export const PRIMARY_LINKS = [
  { label: 'Smartphones', to: '/smartphones', menu: 'smartphones' },
  { label: 'Eproducts', to: '/eproducts', menu: 'eproducts' },
  { label: 'Eshop', href: EXTERNAL.eshop, external: true, menu: 'eshop' },
  { label: 'Appstore', href: EXTERNAL.appstore, external: true, menu: 'appstore' },
  /*
   * SUPPORT IS NOT IN THE BAR, and the page is still there.
   *
   * /support and everything under it still routes and still works - it is
   * simply not advertised yet. Deleting the pages to hide the button would
   * mean writing them again; taking the button away is one line and
   * reversible. The footer still links to the parts of it that are ready.
   */
  { label: 'Blog', to: '/blog', menu: 'blog' },
  { label: 'About', to: '/about', menu: 'about' }
];

/*
 * THE FOOTER IS NOT HERE ANY MORE.
 *
 * It was four columns of hardcoded links, which meant a phone number or a
 * download URL could only be changed by cutting a release. It is content,
 * so the operations console owns it now and the storefront reads it from
 * GET /site/footer - see components/layout/Footer.js and, on the server,
 * services/footer.service.js, which holds the default a site renders
 * before anybody has edited anything.
 */

/**
 * THE PHONE MENU, and it is STATIC on purpose.
 *
 * The desktop mega-panel is built from the live category tree (siteMenu.js),
 * because it has the room to show what the catalogue actually contains. The
 * phone menu does not, and it must not: a drill-down list that waits on
 * `GET /categories` is a menu that opens EMPTY on the tap that opened it, on
 * exactly the connection least able to afford the round trip. So this is the
 * navigation SKELETON - the pages that exist whatever the catalogue holds -
 * and every branch ends at a landing page that lists the live data itself.
 *
 * That is also why Eproducts does not list its sections here. They are rows in
 * `product_categories` and they change; naming them in this file would be
 * hardcoding product data (development rule 1), and the moment one is renamed
 * the menu is lying. /eproducts already lists them, from the API.
 *
 * The order is the spec's, top to bottom. The account row that opens the list
 * is NOT in here: it is the one entry that depends on who is looking, so
 * MobileNav renders it above these.
 */
export const MOBILE_NAV = [
  {
    key: 'smartphones',
    label: 'Smartphones',
    links: [
      { label: 'All smartphones', to: '/smartphones/products' },
      { label: 'Compare phones', to: '/smartphones/compare' },
      /* The handset counter, in the handset menu - not behind Support. */
      { label: 'Service centres', to: '/support/centres/smartphones' },
      { label: 'Crystal OS', to: '/support/os' }
    ]
  },
  {
    key: 'eproducts',
    label: 'Eproducts',
    links: [
      { label: 'All eproducts', to: '/eproducts' },
      { label: 'Service centres', to: '/support/centres/eproducts' }
    ]
  },
  /*
   * THE TWO STORES ARE BRANCHES, not links that leave.
   *
   * They were top-level rows carrying the external-link icon, which told
   * a member that tapping Eshop takes them off Crystal - and to a member
   * the Eshop IS Crystal. They open like every other branch now, with the
   * chevron every other branch has, and the one row that genuinely leaves
   * sits inside where an external icon is the truth rather than a warning
   * about the whole section.
   */
  {
    key: 'eshop',
    label: 'Crystal Eshop',
    links: [
      { label: 'Cards', to: '/account/eshop/card' },
      { label: 'Orders', to: '/account/eshop/orders' },
      { label: 'Transactions', to: '/account/eshop/transactions' },
      { label: 'Experience Log', to: '/account/eshop/experience' },
      { label: 'Commerce Values', to: '/account/eshop/commerce' },
      { label: 'Open the Eshop', href: EXTERNAL.eshop, external: true }
    ]
  },
  {
    key: 'appstore',
    label: 'Crystal Appstore',
    links: [
      { label: 'Purchases', to: '/account/appstore/purchases' },
      { label: 'Comments', to: '/account/appstore/comments' },
      { label: 'Favorites', to: '/account/appstore/favourites' },
      { label: 'Wallet', to: '/account/appstore/wallet' },
      { label: 'Open the Appstore', href: EXTERNAL.appstore, external: true }
    ]
  },
  {
    key: 'support',
    label: 'Support',
    links: [
      { label: 'Support home', to: '/support' },
      { label: 'Repair pricing', to: '/support/pricing' },
      /* Crystal OS belongs to the handsets; it is in the Smartphones branch. */
      { label: 'Warranty', to: '/support/warranty' },
      { label: 'FAQ', to: '/support/faq' },
      { label: 'Contact us', to: '/support/contact' }
    ]
  },
  { key: 'blog', label: 'Blog', to: '/blog' },
  { key: 'about', label: 'About', to: '/about' }
];
