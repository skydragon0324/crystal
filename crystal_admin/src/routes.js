import Dashboard from './pages/Dashboard';

import Tickets from './pages/service/Tickets';
import TicketDetail from './pages/service/TicketDetail';
import Warranties from './pages/service/Warranties';
import Policies from './pages/service/Policies';
import Technicians from './pages/service/Technicians';
import Parts from './pages/service/Parts';
import Stock from './pages/service/Stock';
import Replenishments from './pages/service/Replenishments';
import Claims from './pages/service/Claims';
import Symptoms from './pages/service/Symptoms';

import AgencyHealth from './pages/analysis/AgencyHealth';
import DefectWatch from './pages/analysis/DefectWatch';
import Monthly from './pages/analysis/Monthly';

import { SmartphoneProducts, EproductProducts } from './pages/catalog/Products';
import ProductEditor from './pages/catalog/ProductEditor';
import AboutImages from './pages/company/AboutImages';
import Categories from './pages/catalog/Categories';
import Series from './pages/catalog/Series';
import Specifications from './pages/catalog/Specifications';
import Media from './pages/catalog/Media';
import Os from './pages/catalog/Os';

import { SmartphoneAgencies, EproductAgencies } from './pages/support/Agencies';
import Faqs from './pages/support/Faqs';
import { SmartphonePricing, EproductPricing } from './pages/support/Pricing';

import Accounts from './pages/members/Accounts';
import Registrations from './pages/members/Registrations';
import Licenses from './pages/members/Licenses';
import Feedback from './pages/members/Feedback';
import Wallets from './pages/members/Wallets';

import Articles from './pages/blog/Articles';
import Settings from './pages/base/Settings';
import Footer from './pages/base/Footer';

import Notices from './pages/base/Notices';
import NoticeOrigins from './pages/base/NoticeOrigins';

import Admins from './pages/management/Admins';
import Roles from './pages/management/Roles';
import Pages from './pages/management/Pages';
import Permissions from './pages/management/Permissions';
import Audit from './pages/management/Audit';

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
  /*
   * ONE ABOUT SCREEN, not ten. Every word of the page used to be editable
   * here; the words are in the site's own source now and only the pictures
   * are data. See sql/deltas/019.
   */
  { path: '/admin/company/about-images', component: AboutImages },

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

export default routes;
