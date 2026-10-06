import {
  FiCreditCard, FiEdit3, FiGrid, FiHeadphones, FiMapPin, FiPackage,
  FiShield, FiShoppingBag, FiSmartphone, FiTruck,
} from 'react-icons/fi';
import { getLangText } from 'lang/lang';
import { mockPhotoUrl } from 'utils/mockImage';
import { PAGE_FEEDBACK_URL } from 'constants/constants';

/**
 * Landing page content.
 *
 * The homepage is mostly editorial: four advertising slides, six category
 * shortcuts, three promos and four service promises. None of that comes
 * from the API, and none of it belongs inline in the component - a
 * marketing change should be an edit here, not a JSX diff.
 *
 * Every export is a function for the same reason as the menus: the copy is
 * translated, and a module-level array would capture whichever language
 * the bundle first evaluated in.
 */

/** The advertising deck at the top of the page. */
export const getHomeHeroSlides = () => {
  const banner = (seed) => mockPhotoUrl(seed, { width: 1600, height: 720 });

  return [
    {
      key: 'launch',
      mock: banner('vendor-home-launch'),
      eyebrow: getLangText('HOME_HERO_1_EYEBROW'),
      title: getLangText('HOME_HERO_1_TITLE'),
      subtitle: getLangText('HOME_HERO_1_SUB'),
      cta: { label: getLangText('HOME_HERO_1_CTA'), to: '/vendor/phone/products' },
      align: 'left',
    },
    {
      key: 'tradein',
      mock: banner('vendor-home-tradein'),
      eyebrow: getLangText('HOME_HERO_2_EYEBROW'),
      title: getLangText('HOME_HERO_2_TITLE'),
      subtitle: getLangText('HOME_HERO_2_SUB'),
      cta: { label: getLangText('HOME_HERO_2_CTA'), to: '/vendor/phone/agencies' },
      align: 'left',
    },
    {
      key: 'points',
      mock: banner('vendor-home-points'),
      eyebrow: getLangText('HOME_HERO_3_EYEBROW'),
      title: getLangText('HOME_HERO_3_TITLE'),
      subtitle: getLangText('HOME_HERO_3_SUB'),
      cta: { label: getLangText('HOME_HERO_3_CTA'), to: '/vendor/account/eshop/orders' },
      align: 'center',
    },
    {
      key: 'service',
      mock: banner('vendor-home-service'),
      eyebrow: getLangText('HOME_HERO_4_EYEBROW'),
      title: getLangText('HOME_HERO_4_TITLE'),
      subtitle: getLangText('HOME_HERO_4_SUB'),
      cta: { label: getLangText('HOME_HERO_4_CTA'), to: '/vendor/phone/faqs' },
      align: 'left',
    },
  ];
};

/**
 * Category shortcuts.
 *
 * `external` entries leave the SPA - the shop, the app store and the
 * eproduct portal are separate applications behind the same domain, so
 * they have to be plain anchors rather than router links.
 */
export const getHomeShortcuts = () => [
  { key: 'phones', icon: FiSmartphone, name: getLangText('HOME_SHORTCUT_PHONES'), path: '/vendor/phone/products' },
  { key: 'eshop', icon: FiShoppingBag, name: getLangText('HOME_SHORTCUT_ESHOP'), path: '/eshop/www', external: true },
  { key: 'appstore', icon: FiGrid, name: getLangText('HOME_SHORTCUT_APPSTORE'), path: '/appstore', external: true },
  { key: 'eprod', icon: FiPackage, name: getLangText('HOME_SHORTCUT_EPROD'), path: '/eproduct', external: true },
  { key: 'blog', icon: FiEdit3, name: getLangText('HOME_SHORTCUT_BLOG'), path: '/vendor/blog' },
  { key: 'support', icon: FiHeadphones, name: getLangText('HOME_SHORTCUT_SUPPORT'), path: '/vendor/phone/faqs' },
];

/** The three promo cards under the featured products. */
export const getHomePromos = () => [
  {
    key: 'accessories',
    mock: mockPhotoUrl('vendor-promo-accessories', { width: 800, height: 600 }),
    title: getLangText('HOME_PROMO_1_TITLE'),
    body: getLangText('HOME_PROMO_1_BODY'),
    path: '/vendor/phone/products',
  },
  {
    key: 'warranty',
    mock: mockPhotoUrl('vendor-promo-warranty', { width: 800, height: 600 }),
    title: getLangText('HOME_PROMO_2_TITLE'),
    body: getLangText('HOME_PROMO_2_BODY'),
    path: '/vendor/phone/faqs',
  },
  {
    key: 'software',
    mock: mockPhotoUrl('vendor-promo-software', { width: 800, height: 600 }),
    title: getLangText('HOME_PROMO_3_TITLE'),
    body: getLangText('HOME_PROMO_3_BODY'),
    path: PAGE_FEEDBACK_URL,
    auth: true,
  },
];

/** The service promises strip above the footer. */
export const getHomeValueProps = () => [
  { key: 'delivery', icon: FiTruck, title: getLangText('HOME_VALUE_1_TITLE'), body: getLangText('HOME_VALUE_1_BODY') },
  { key: 'warranty', icon: FiShield, title: getLangText('HOME_VALUE_2_TITLE'), body: getLangText('HOME_VALUE_2_BODY') },
  { key: 'service', icon: FiMapPin, title: getLangText('HOME_VALUE_3_TITLE'), body: getLangText('HOME_VALUE_3_BODY') },
  { key: 'payment', icon: FiCreditCard, title: getLangText('HOME_VALUE_4_TITLE'), body: getLangText('HOME_VALUE_4_BODY') },
];
