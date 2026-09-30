import React, { lazy } from 'react';

/**
 * A route component that downloads its screen only when needed.
 *
 * `preload` is used by the sidebar on hover/focus, so a deliberate click
 * normally finds the chunk already in flight. Keeping the resolved component
 * lets tests and repeat mounts render synchronously after preload.
 */
function deferred(loader, select) {
  let resolved = null;
  let pending = null;

  const load = function () {
    if (!pending) {
      pending = loader().then(function (module) {
        resolved = select ? select(module) : module.default;
        return { default: resolved };
      });
    }
    return pending;
  };

  const LazyPage = lazy(load);
  function DeferredPage(props) {
    if (resolved) {
      const Page = resolved;
      return <Page {...props} />;
    }
    return <LazyPage {...props} />;
  }
  DeferredPage.preload = load;
  return DeferredPage;
}

const Dashboard = deferred(() => import(/* webpackChunkName: "admin-dashboard" */ './pages/Dashboard'));

const Tickets = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Tickets'));
const TicketDetail = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/TicketDetail'));
const Warranties = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Warranties'));
const Policies = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Policies'));
const Technicians = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Technicians'));
const Parts = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Parts'));
const Stock = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Stock'));
const Replenishments = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Replenishments'));
const Claims = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Claims'));
const Symptoms = deferred(() => import(/* webpackChunkName: "admin-service" */ './pages/service/Symptoms'));

const AgencyHealth = deferred(() => import(/* webpackChunkName: "admin-analysis" */ './pages/analysis/AgencyHealth'));
const DefectWatch = deferred(() => import(/* webpackChunkName: "admin-analysis" */ './pages/analysis/DefectWatch'));
const Monthly = deferred(() => import(/* webpackChunkName: "admin-analysis" */ './pages/analysis/Monthly'));

const SmartphoneProducts = deferred(
  () => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Products'),
  (module) => module.SmartphoneProducts
);
const EproductProducts = deferred(
  () => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Products'),
  (module) => module.EproductProducts
);
const ProductEditor = deferred(() => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/ProductEditor'));
const Categories = deferred(() => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Categories'));
const Series = deferred(() => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Series'));
const Specifications = deferred(() => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Specifications'));
const Media = deferred(() => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Media'));
const HomeAdverts = deferred(
  () => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Adverts'),
  (module) => module.HomeAdverts
);
const SmartphoneAdverts = deferred(
  () => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Adverts'),
  (module) => module.SmartphoneAdverts
);
const Popups = deferred(() => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Popups'));
const Os = deferred(() => import(/* webpackChunkName: "admin-catalog" */ './pages/catalog/Os'));

const SmartphoneAgencies = deferred(
  () => import(/* webpackChunkName: "admin-support" */ './pages/support/Agencies'),
  (module) => module.SmartphoneAgencies
);
const EproductAgencies = deferred(
  () => import(/* webpackChunkName: "admin-support" */ './pages/support/Agencies'),
  (module) => module.EproductAgencies
);
const Faqs = deferred(() => import(/* webpackChunkName: "admin-support" */ './pages/support/Faqs'));
const Provinces = deferred(() => import(/* webpackChunkName: "admin-support" */ './pages/support/Provinces'));
const SmartphonePricing = deferred(
  () => import(/* webpackChunkName: "admin-support" */ './pages/support/Pricing'),
  (module) => module.SmartphonePricing
);
const EproductPricing = deferred(
  () => import(/* webpackChunkName: "admin-support" */ './pages/support/Pricing'),
  (module) => module.EproductPricing
);

const Accounts = deferred(() => import(/* webpackChunkName: "admin-members" */ './pages/members/Accounts'));
const Registrations = deferred(() => import(/* webpackChunkName: "admin-members" */ './pages/members/Registrations'));
const Licenses = deferred(() => import(/* webpackChunkName: "admin-members" */ './pages/members/Licenses'));
const Feedback = deferred(() => import(/* webpackChunkName: "admin-members" */ './pages/members/Feedback'));
const Wallets = deferred(() => import(/* webpackChunkName: "admin-members" */ './pages/members/Wallets'));

const Articles = deferred(() => import(/* webpackChunkName: "admin-content" */ './pages/blog/Articles'));
const Settings = deferred(() => import(/* webpackChunkName: "admin-content" */ './pages/base/Settings'));
const Footer = deferred(() => import(/* webpackChunkName: "admin-content" */ './pages/base/Footer'));
const Notices = deferred(() => import(/* webpackChunkName: "admin-content" */ './pages/base/Notices'));
const NoticeOrigins = deferred(() => import(/* webpackChunkName: "admin-content" */ './pages/base/NoticeOrigins'));

const Admins = deferred(() => import(/* webpackChunkName: "admin-management" */ './pages/management/Admins'));
const Roles = deferred(() => import(/* webpackChunkName: "admin-management" */ './pages/management/Roles'));
const Pages = deferred(() => import(/* webpackChunkName: "admin-management" */ './pages/management/Pages'));
const Permissions = deferred(() => import(/* webpackChunkName: "admin-management" */ './pages/management/Permissions'));
const Audit = deferred(() => import(/* webpackChunkName: "admin-management" */ './pages/management/Audit'));

/**
 * Every screen, addressed by the SAME url the permission grid uses.
 *
 * That is the whole point of this file.  The sidebar is built from the rows
 * the API sent, the guard is applied against a page url, and the router
 * matches on the same string - so "what a role may open", "what the menu
 * shows" and "what the browser can reach" are one answer rather than three
 * that drift.
 *
 * `exact` is false only where a screen owns a subtree - a ticket detail lives
 * under the ticket list's url, and reads its permission from it.
 */
const routes = [
  { path: '/admin/dashboard', component: Dashboard },

  { path: '/admin/service/tickets/:id', component: TicketDetail },
  { path: '/admin/service/tickets', component: Tickets },
  { path: '/admin/service/warranties', component: Warranties },
  { path: '/admin/service/policies', component: Policies },
  { path: '/admin/service/technicians', component: Technicians },
  { path: '/admin/service/parts', component: Parts },
  { path: '/admin/service/stock', component: Stock },
  { path: '/admin/service/replenishments', component: Replenishments },
  { path: '/admin/service/claims', component: Claims },
  { path: '/admin/service/symptoms', component: Symptoms },

  { path: '/admin/analysis/agency-health', component: AgencyHealth },
  { path: '/admin/analysis/defect-watch', component: DefectWatch },
  { path: '/admin/analysis/monthly', component: Monthly },

  /*
   * The two section lists come BEFORE the editor route, and the order is
   * load bearing.
   *
   * Every route here is exact, and a Switch takes the FIRST match - so with
   * the editor first, '/products/smartphone' is read as a product whose id is
   * 'smartphone' and the list never renders.
   */
  { path: '/admin/catalog/products/smartphone', component: SmartphoneProducts },
  { path: '/admin/catalog/products/eproduct', component: EproductProducts },
  { path: '/admin/catalog/products/:id', component: ProductEditor },
  { path: '/admin/catalog/categories', component: Categories },
  { path: '/admin/catalog/series', component: Series },
  { path: '/admin/catalog/specifications', component: Specifications },
  { path: '/admin/catalog/media', component: Media },
  { path: '/admin/catalog/adverts/home', component: HomeAdverts },
  { path: '/admin/catalog/adverts/smartphone', component: SmartphoneAdverts },
  { path: '/admin/catalog/adverts/popup', component: Popups },
  { path: '/admin/catalog/os', component: Os },

  /*
   * TWO SCREENS OVER ONE TABLE.
   *
   * Smartphone and eproduct service centres are run by different people, so
   * they are separate pages granted separately in the permission grid. The
   * agency row behind them is the same one - what differs is what the centre
   * offers, which is what each page edits.
   */
  { path: '/admin/support/agencies/smartphone', component: SmartphoneAgencies },
  { path: '/admin/support/agencies/eproduct', component: EproductAgencies },
  /* What both centre lists are filed under, and the storefront filter's order. */
  { path: '/admin/support/provinces', component: Provinces },
  { path: '/admin/support/faqs', component: Faqs },
  { path: '/admin/support/pricing/smartphone', component: SmartphonePricing },
  { path: '/admin/support/pricing/eproduct', component: EproductPricing },

  { path: '/admin/members/accounts', component: Accounts },
  { path: '/admin/members/registrations', component: Registrations },
  { path: '/admin/members/licenses', component: Licenses },
  { path: '/admin/members/feedback', component: Feedback },
  { path: '/admin/members/wallets', component: Wallets },

  { path: '/admin/blog/articles', component: Articles },
  { path: '/admin/base/settings', component: Settings },
  { path: '/admin/base/footer', component: Footer },
  { path: '/admin/base/notices', component: Notices },
  { path: '/admin/base/notice-origins', component: NoticeOrigins },

  /*
   * THE ABOUT PAGE, one screen per chapter.
   *
   * Every one of them is a configuration of the same two components rather
   * than a folder of its own - which is the same argument the three tables
   * behind them make.
   */
  { path: '/admin/management/admins', component: Admins },
  { path: '/admin/management/roles', component: Roles },
  { path: '/admin/management/pages', component: Pages },
  { path: '/admin/management/permissions', component: Permissions },
  { path: '/admin/management/audit', component: Audit }
];

/**
 * PERMISSION PAGES THAT ARE NOT SCREENS.
 *
 * Three permissions cover two screens each - products, service centres and
 * repair pricing all split into a smartphone page and an eproduct page, and
 * the grid grants the parent. So `/admin/catalog/products` is a real page
 * url that every screen under it reads its permission from, and nothing was
 * ever routed to it.
 *
 * That matters because a role LANDS on a page url. The roles screen offers
 * every registered page as "lands on after signing in", the seed already
 * picks this one for the content editor, and the router's catch-all quietly
 * sent all of them to the dashboard instead - so the setting looked applied
 * and did nothing.
 *
 * Each one sends the reader to its first screen.
 */
export const REDIRECTS = [
  { from: '/admin/catalog/products', to: '/admin/catalog/products/smartphone' },
  { from: '/admin/support/agencies', to: '/admin/support/agencies/smartphone' },
  { from: '/admin/support/pricing', to: '/admin/support/pricing/smartphone' }
];

/** Begin a screen download while a menu item is being considered. */
export function preloadRoute(path) {
  const redirect = REDIRECTS.find((entry) => entry.from === path);
  const target = redirect ? redirect.to : path;
  const route = routes.find((entry) => entry.path === target);
  if (route && route.component && route.component.preload) route.component.preload();
}

export default routes;
