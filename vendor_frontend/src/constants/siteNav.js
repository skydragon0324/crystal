import { getLangText } from 'lang/lang';
import { getClientMenus } from 'constants/clientMenus';
import { PAGE_FEEDBACK_URL } from 'constants/constants';

/**
 * Site chrome navigation.
 *
 * The header reads CLIENT_MENUS directly, so the desktop bar, the mobile
 * panel and the sidebar cannot drift apart. The footer needs a wider set of
 * links than the header carries - support, legal, company - so those live
 * here rather than being bolted onto CLIENT_MENUS and leaking into the
 * primary navigation.
 */

/**
 * Flatten CLIENT_MENUS into what the header bar renders.
 *
 * A group with a `category` becomes a dropdown; a group without one is a
 * single top-level link, which is how the external Eshop / Appstore /
 * Eproduct entries are declared.
 */
export const buildHeaderNav = () =>
  getClientMenus().map((group) => {
    if (group.category) {
      return {
        name: group.category.name,
        path: group.category.path,
        external: group.category.external,
        children: group.menus || [],
      };
    }
    if (group.menus && group.menus.length) {
      const first = group.menus[0];
      return {
        name: first.name,
        path: first.path,
        external: first.external,
        children: [],
      };
    }
    return null;
  }).filter(Boolean);

/**
 * Footer link columns, mirroring the four-column mi.com layout.
 *
 * A function for the same reason getClientMenus() is: the titles and link
 * names are translated, and an array built at import time would pin them
 * to the language the bundle first evaluated in.
 */
export const getFooterColumns = () => [
  {
    title: getLangText('FOOTER_COL_PRODUCTS'),
    links: [
      { name: getLangText('FOOTER_LINK_PHONES'), path: '/vendor/phone/products' },
      { name: getLangText('FOOTER_LINK_ACCESSORIES'), path: '/vendor/phone/products' },
      { name: getLangText('FOOTER_LINK_ESHOP'), path: '/eshop/www', external: true },
      { name: getLangText('FOOTER_LINK_APPSTORE'), path: '/appstore', external: true },
      { name: getLangText('FOOTER_LINK_EPROD'), path: '/eproduct', external: true },
    ],
  },
  {
    title: getLangText('FOOTER_COL_SUPPORT'),
    links: [
      { name: getLangText('FOOTER_LINK_SERVICE_CENTRES'), path: '/vendor/phone/agencies' },
      { name: getLangText('FOOTER_LINK_FAQ'), path: '/vendor/phone/faqs' },
      { name: getLangText('FOOTER_LINK_WARRANTY'), path: '/vendor/phone/faqs' },
      { name: getLangText('FOOTER_LINK_OS_UPDATES'), path: '/vendor/phone/products' },
      { name: getLangText('FOOTER_LINK_FEEDBACK'), path: PAGE_FEEDBACK_URL, auth: true },
    ],
  },
  {
    title: getLangText('FOOTER_COL_ABOUT'),
    links: [
      { name: getLangText('FOOTER_LINK_ABOUT_US'), path: '/vendor/intro' },
      { name: getLangText('FOOTER_LINK_NEWS'), path: '/vendor/blog' },
      { name: getLangText('FOOTER_LINK_CAREERS'), path: '/vendor/intro' },
    ],
  },
  {
    title: getLangText('FOOTER_COL_COMMUNITY'),
    links: [
      { name: getLangText('FOOTER_LINK_BLOG'), path: '/vendor/blog' },
      { name: getLangText('FOOTER_LINK_FORUM'), path: '/vendor/blog' },
      { name: getLangText('FOOTER_LINK_HONOR'), path: '/vendor/blog' },
    ],
  },
];

/** Bottom strip, next to the copyright. */
export const getFooterLegalLinks = () => [
  { name: getLangText('FOOTER_PRIVACY'), path: '/vendor/intro' },
  { name: getLangText('FOOTER_TERMS'), path: '/vendor/intro' },
  { name: getLangText('FOOTER_LEGAL'), path: '/vendor/intro' },
  { name: getLangText('FOOTER_SITEMAP'), path: '/vendor/intro' },
];

/** Header height, in px, at each breakpoint. */
export const HEADER_HEIGHT = { base: 56, md: 64 };

/** mi.com pins its content to a fixed centred column; this is that width. */
export const SITE_MAX_WIDTH = '1226px';
