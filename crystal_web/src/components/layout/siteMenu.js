import { EXTERNAL } from './siteNav';
import { centresPathOf } from '@/components/support/serviceSections';

/**
 * Builds the menu model from the LIVE category tree.
 *
 * The desktop mega-panel and the mobile sheet both call this, so the two
 * cannot disagree about what the catalogue contains. Hardcoding the columns
 * is what leaves `?series=C9` links pointing at a filter the catalogue no
 * longer understands (development rule 1: content comes from the API).
 *
 * @param {array} categories  from GET /categories
 * @returns {array} [{ key, title, href, links: [{ label, to, hint }] }]
 */
export function buildMenu(categories) {
  const list = categories || [];
  const smartphones = list.filter((category) => category.type === 'SMARTPHONE');
  const eproducts = list.filter((category) => category.type !== 'SMARTPHONE');

  const columns = [];

  /*
   * SERVICE CENTRES BELONG TO THE PRODUCT, not to Support.
   *
   * They sat under Support with the two networks indented beneath them, which
   * put the choice one level too deep and in the wrong place: somebody with a
   * broken handset is in the Smartphones menu, not hunting through a support
   * index for a submenu that then asks them which kind of centre they want.
   * The two counters are run by different managers and serve different
   * customers, so each menu carries its own - and neither has to be chosen
   * from a list of two.
   */
  if (smartphones.length) {
    columns.push({
      key: 'smartphones',
      title: 'Smartphones',
      href: '/smartphones',
      links: [
        { label: 'All smartphones', to: '/smartphones/products' },
        { label: 'Compare phones', to: '/smartphones/compare' },
        { label: 'Service centres', to: centresPathOf('SMARTPHONE') },
        { label: 'Crystal OS', to: '/support/os' }
      ]
    });
  }

  if (eproducts.length) {
    columns.push({
      key: 'eproducts',
      title: 'Eproducts',
      href: '/eproducts',
      links: eproducts.map((category) => ({
        label: category.name,
        to: `/eproducts/${category.slug}`,
        hint: category.product_cnt ? `${category.product_cnt}` : undefined
      })).concat([
        { label: 'Service centres', to: centresPathOf('EPRODUCT') }
      ])
    });
  }

  columns.push({
    key: 'shop',
    title: 'Shop',
    links: [
      { label: 'Crystal Eshop', href: EXTERNAL.eshop, external: true },
      { label: 'Crystal Appstore', href: EXTERNAL.appstore, external: true }
    ]
  });

  columns.push({
    key: 'support',
    title: 'Support',
    href: '/support',
    links: [
      /*
       * NO SERVICE CENTRES HERE ANY MORE.
       *
       * They were this column's first entry, with the two networks indented
       * under it. Both counters now sit in their own product menu, which is
       * where somebody holding the product already is - and it means the
       * choice between them is made by which menu you opened rather than by a
       * submenu asking you to pick from two.
       */
      { label: 'Repair pricing', to: '/support/pricing' },
      /*
       * NO CRYSTAL OS HERE EITHER.
       *
       * It is a property of the handsets - the release notes are per model and
       * the page is reached from a phone the reader owns. It already sits in
       * the Smartphones column above, and a second entry under Support was the
       * same page listed twice, inviting the reader to wonder what the
       * difference was.
       */
      { label: 'Warranty', to: '/support/warranty' },
      { label: 'FAQ', to: '/support/faq' },
      { label: 'Contact us', to: '/support/contact' }
    ]
  });

  return columns;
}

/**
 * THE PANEL'S COLUMNS, which are the same whichever heading opened it.
 *
 * EVERY HEADING OPENS IT - that is the part worth keeping. Only Smartphones
 * and Eproducts used to react to the pointer, and a bar that answers a hover
 * on two of its six entries teaches the visitor it is not hoverable at all.
 *
 * WHAT IT SHOWS IS THE WHOLE MENU, not a slice of it chosen by which heading
 * the pointer is over. That was tried and it was worse: the Eshop and the
 * Appstore have no sections of their own to show, so they got an invented
 * list of account pages, and the panel changed shape under the pointer as it
 * travelled along the bar. One panel with the site's actual structure in it
 * is steadier to read and is what the bar is for.
 *
 * `menu` is therefore only "is anything open" - it is kept as an argument
 * rather than a boolean so the caller passes what it has.
 *
 * @param {array} categories  from GET /categories
 * @param {string} menu       which heading is open, or null for none
 * @returns {array} [{ key, title, href, links: [{ label, to, hint }] }]
 */
export function menuColumns(categories, menu) {
  return menu ? buildMenu(categories) : [];
}
