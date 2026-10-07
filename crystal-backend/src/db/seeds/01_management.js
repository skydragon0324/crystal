const bcrypt = require('bcryptjs');

/**
 * The console's own furniture, and the accounts that can open it.
 *
 * Every admin route in the API is registered in admin_pages here.  A route
 * whose row is missing is refused with a 500 that says so, deliberately -
 * see middleware/permission.js - so this list and src/routes are two halves
 * of one thing and are changed together.
 *
 * Four roles, and they are not ranks: an EDITOR runs the blog and must not
 * see a member's wallet, while a BRANCH manager runs one service centre and
 * must not approve the claim that pays it.  That is why permissions are a
 * grid rather than a number.
 */

const PAGES = [
  /* url,                                 name,                 icon,         parent */
  ['/admin/dashboard', 'Dashboard', 'MdDashboard', null],

  ['/admin/service', 'Service operations', 'MdBuild', null],
  ['/admin/service/tickets', 'Repair tickets', 'MdAssignment', '/admin/service'],
  ['/admin/service/warranties', 'Warranties', 'MdVerifiedUser', '/admin/service'],
  ['/admin/service/policies', 'Warranty policies', 'MdGavel', '/admin/service'],
  ['/admin/service/technicians', 'Technicians', 'MdPeople', '/admin/service'],
  ['/admin/service/parts', 'Parts catalogue', 'MdMemory', '/admin/service'],
  ['/admin/service/stock', 'Parts stock', 'MdViewList', '/admin/service'],
  ['/admin/service/replenishments', 'Replenishments', 'MdLocalShipping', '/admin/service'],
  ['/admin/service/claims', 'Warranty claims', 'MdReceipt', '/admin/service'],
  ['/admin/service/symptoms', 'Symptom catalogue', 'MdReportProblem', '/admin/service'],

  ['/admin/analysis', 'Analysis', 'MdAssessment', null],
  ['/admin/analysis/agency-health', 'Service centre health', 'MdLocalHospital', '/admin/analysis'],
  ['/admin/analysis/defect-watch', 'Defect watch', 'MdWarning', '/admin/analysis'],
  ['/admin/analysis/monthly', 'Monthly report', 'MdInsertChart', '/admin/analysis'],

  ['/admin/catalog', 'Catalogue', 'MdViewModule', null],
  /*
   * PRODUCTS ARE TWO PAGES, and the reason is permissions.
   *
   * Smartphones and eproducts are run by different managers, and the grant
   * grid is per page with PREFIX inheritance - so two pages under one
   * parent is the whole mechanism, with no new concept needed. A role
   * granted `/admin/catalog/products/smartphone` cannot open the eproduct
   * list; a role granted `/admin/catalog/products` gets both.
   *
   * The parent is registered but NOT in the menu (the false at the end):
   * the API guards on it, the product editor lives under it at
   * `/products/:id`, and a third "Products" entry beside the two real ones
   * would be a menu item nobody should click.
   */
  ['/admin/catalog/products', 'Products', 'MdSmartphone', '/admin/catalog', false],
  ['/admin/catalog/products/smartphone', 'Smartphones', 'MdSmartphone', '/admin/catalog'],
  ['/admin/catalog/products/eproduct', 'Eproducts', 'MdTv', '/admin/catalog'],
  ['/admin/catalog/categories', 'Categories', 'MdLabel', '/admin/catalog'],
  ['/admin/catalog/series', 'Series', 'MdLayers', '/admin/catalog'],
  ['/admin/catalog/specifications', 'Specifications', 'MdList', '/admin/catalog'],
  ['/admin/catalog/media', 'Media library', 'MdImage', '/admin/catalog'],
  /*
   * THE ADVERTISING AT THE TOP OF TWO PAGES, each run by its own screen.
   * An advert belongs to no product, so it is not in the media library; see
   * sql/deltas/026.
   */
  ['/admin/catalog/adverts/home', 'Homepage adverts', 'MdViewCarousel', '/admin/catalog'],
  ['/admin/catalog/adverts/smartphone', 'Smartphone adverts', 'MdSlideshow', '/admin/catalog'],
  /* The full-screen ones, which run for a period - sql/deltas/034. */
  ['/admin/catalog/adverts/popup', 'Popup adverts', 'MdAnnouncement', '/admin/catalog'],
  ['/admin/catalog/os', 'Crystal OS', 'MdSystemUpdate', '/admin/catalog'],

  ['/admin/support', 'Support', 'MdHeadsetMic', null],
  /*
   * The same split for service centres, and for the same reason. One
   * `agencies` row behind both - a place that moves has one address to
   * update - with the section carried on what it OFFERS.
   */
  ['/admin/support/agencies', 'Service centres', 'MdStore', '/admin/support', false],
  ['/admin/support/agencies/smartphone', 'Smartphone centres', 'MdStore', '/admin/support'],
  ['/admin/support/agencies/eproduct', 'Eproduct centres', 'MdShop', '/admin/support'],
  /*
   * THE PROVINCES the two centre lists are filed under, and the ORDER the
   * storefront's province filter lists them in. Beside the centres rather
   * than under Base: whoever runs the network is who decides which province
   * a visitor sees first. See sql/deltas/032.
   */
  ['/admin/support/provinces', 'Provinces', 'MdMap', '/admin/support'],
  ['/admin/support/faqs', 'FAQ', 'MdQuestionAnswer', '/admin/support'],
  /*
   * Repair pricing splits the same way, and for the same reason: the two
   * lists are maintained by different people. The parent stays registered
   * but out of the menu - it guards the API and a grant on it covers both.
   */
  ['/admin/support/pricing', 'Repair pricing', 'MdAttachMoney', '/admin/support', false],
  ['/admin/support/pricing/smartphone', 'Smartphone pricing', 'MdAttachMoney', '/admin/support'],
  ['/admin/support/pricing/eproduct', 'Eproduct pricing', 'MdMonetizationOn', '/admin/support'],

  ['/admin/members', 'Members', 'MdPerson', null],
  ['/admin/members/accounts', 'Member accounts', 'MdPersonOutline', '/admin/members'],
  ['/admin/members/registrations', 'Registered devices', 'MdDevices', '/admin/members'],
  ['/admin/members/licenses', 'Licences', 'MdVpnKey', '/admin/members'],
  ['/admin/members/feedback', 'Feedback', 'MdFeedback', '/admin/members'],
  ['/admin/members/wallets', 'Wallets', 'MdAccountBalanceWallet', '/admin/members'],

  ['/admin/blog', 'Blog', 'MdDescription', null],
  ['/admin/blog/articles', 'Articles', 'MdEdit', '/admin/blog'],

  ['/admin/base', 'Base', 'MdSettings', null],
  ['/admin/base/settings', 'System settings', 'MdTune', '/admin/base'],
  ['/admin/base/footer', 'Website and app footer', 'MdViewDay', '/admin/base'],
  ['/admin/base/notices', 'Site notices', 'MdAnnouncement', '/admin/base'],
  /*
   * WHO A NOTICE IS FROM, on its own screen.
   *
   * A separate page rather than a free-text field on the notice, because an
   * origin is reused across dozens of them: typed each time it is "Service
   * network", "Service Network" and "service centres" within a month, and
   * the badge that was supposed to let a reader pick their own out of a list
   * stops working.
   */
  ['/admin/base/notice-origins', 'Notice origins', 'MdLabelOutline', '/admin/base'],

  ['/admin/management', 'Management', 'MdSecurity', null],
  ['/admin/management/admins', 'Administrators', 'MdSupervisorAccount', '/admin/management'],
  ['/admin/management/roles', 'Roles', 'MdAssignmentInd', '/admin/management'],
  ['/admin/management/pages', 'Pages', 'MdWeb', '/admin/management'],
  ['/admin/management/permissions', 'Permissions', 'MdLock', '/admin/management'],
  ['/admin/management/audit', 'Audit log', 'MdHistory', '/admin/management'],

  /*
   * THE CRM, one group of its own.
   *
   * At the END of the list rather than beside Members, and that is not a
   * statement about importance: a page's sort_order is its position here, and
   * an install that is migrated rather than reseeded receives these rows from
   * syncPages with the positions they have in this array. Put in the middle,
   * they would take numbers the existing pages already hold and the menu would
   * interleave. See sql/deltas/036 and migration 20260930100000.
   *
   * Nothing under /admin/crm replaces a screen above. Repair tickets, member
   * accounts, registered devices and wallets carry on exactly as they are; the
   * CRM reads them and keeps its own customer, product, service and points
   * record beside them.
   */
  ['/admin/crm', 'CRM', 'MdContacts', null],
  ['/admin/crm/overview', 'CRM overview', 'MdDonutLarge', '/admin/crm'],
  /* The design's core: who the customer is, what they did, what it is worth. */
  ['/admin/crm/customers', 'Customers', 'MdPeopleOutline', '/admin/crm'],
  ['/admin/crm/transactions', 'Transactions', 'MdReceipt', '/admin/crm'],
  ['/admin/crm/products', 'Products and registrations', 'MdDevicesOther', '/admin/crm'],
  ['/admin/crm/transfers', 'Transfers and assignments', 'MdSwapHoriz', '/admin/crm'],
  ['/admin/crm/service-cases', 'Service cases', 'MdHeadset', '/admin/crm'],
  ['/admin/crm/memberships', 'Memberships and tiers', 'MdCardMembership', '/admin/crm'],
  ['/admin/crm/analysis', 'Analysis and grades', 'MdInsertChart', '/admin/crm'],
  ['/admin/crm/segments', 'Segments', 'MdGroupWork', '/admin/crm'],
  ['/admin/crm/campaigns', 'Campaigns', 'MdRecordVoiceOver', '/admin/crm'],
  /* What the vendor ran that the design did not have: points, events, its service network. */
  ['/admin/crm/points', 'Reward points', 'MdStars', '/admin/crm'],
  ['/admin/crm/events', 'Events', 'MdEventAvailable', '/admin/crm'],
  ['/admin/crm/sites', 'Service network', 'MdPlace', '/admin/crm'],
  ['/admin/crm/site-activity', 'Service center activity', 'MdTimeline', '/admin/crm'],
  ['/admin/crm/settings', 'CRM basic data', 'MdSettingsApplications', '/admin/crm']
];

/**
 * Roles, and what each may do.
 *
 * A role's grid is written as a list of prefixes rather than a list of pages,
 * so adding a page under /admin/service does not mean editing four roles -
 * which is how a new screen ends up invisible to everybody except the
 * superuser who added it.
 *
 *   [prefix, level]  level: 0 none, 1 read, 2 write, 3 super
 */
const ROLES = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super administrator',
    home: '/admin/dashboard',
    system: true,
    grants: [['/admin', 3]]
  },
  {
    code: 'OPS_MANAGER',
    name: 'Operations manager',
    home: '/admin/dashboard',
    system: true,
    grants: [
      ['/admin/dashboard', 2],
      ['/admin/service', 2],
      ['/admin/service/claims', 3],      // head office signs off what it owes
      ['/admin/analysis', 1],
      ['/admin/support', 2],
      ['/admin/catalog', 1],
      ['/admin/members', 1],
      ['/admin/management/audit', 1],
      /*
       * Runs the CRM day to day, and reads its settings rather than editing
       * them: a point type or a tier changed mid-year changes what every
       * balance and every event already means.
       */
      ['/admin/crm', 2],
      ['/admin/crm/settings', 1]
    ]
  },
  {
    code: 'BRANCH_MANAGER',
    name: 'Service centre manager',
    home: '/admin/service/tickets',
    system: true,
    grants: [
      ['/admin/dashboard', 1],
      ['/admin/service/tickets', 2],
      ['/admin/service/warranties', 1],
      ['/admin/service/technicians', 2],
      ['/admin/service/parts', 1],
      ['/admin/service/stock', 2],
      ['/admin/service/replenishments', 2],
      // Build and submit its own claim, and no more - approving the payment
      // it is going to receive is not this role's decision.
      ['/admin/service/claims', 2],
      ['/admin/service/symptoms', 1],
      ['/admin/analysis/agency-health', 1],
      ['/admin/support/pricing', 1],
      /*
       * A centre records what happens at its own counter - a prize handed
       * over, a reservation collected, a training session - and looks up the
       * customer in front of it. Nothing else in the CRM is its business.
       */
      ['/admin/crm/site-activity', 2],
      ['/admin/crm/customers', 1]
    ]
  },
  {
    code: 'EDITOR',
    name: 'Content editor',
    home: '/admin/catalog/products',
    system: true,
    grants: [
      ['/admin/dashboard', 1],
      ['/admin/catalog', 2],
      ['/admin/blog', 2],
      ['/admin/support/faqs', 2]
    ]
  }
];

/** The longest prefix that matches wins, so a specific grant beats a broad one. */
function levelFor(grants, url) {
  let best = -1;
  let level = 0;

  grants.forEach(function (grant) {
    const prefix = grant[0];
    if (url !== prefix && url.indexOf(prefix + '/') !== 0) return;
    if (prefix.length > best) {
      best = prefix.length;
      level = grant[1];
    }
  });

  return level;
}

/**
 * Values the platform reads at runtime.
 *
 * Every one of these is a number somebody in operations will eventually want
 * to change, and none of them is worth a release.
 */
const FOOTER_DEFAULT = require('../../services/footer.service').DEFAULT;

const SETTINGS = [
  ['site.footer', JSON.stringify(FOOTER_DEFAULT), 'json', 'site',
    'Website and app footer',
    'Downloads, shared contact numbers, support links, the company address, and site buttons.'],
  ['repair.repeat_window_days', '30', 'number', 'repair',
    'Repeat visit window (days)',
    'A device coming back inside this window is linked to its previous ticket, which is what the repeat rate counts.'],
  ['repair.default_sla_hours', '72', 'number', 'repair',
    'Default SLA (hours)',
    'Used when a service centre has no SLA of its own.'],
  ['warranty.expiring_days', '60', 'number', 'warranty',
    'Expiring soon (days)',
    'How far ahead the warranty list calls cover "expiring".'],
  ['warranty.grace_days', '7', 'number', 'warranty',
    'Grace period (days)',
    'Cover that ran out this recently is still honoured at intake.'],
  ['stock.auto_reorder', 'true', 'boolean', 'stock',
    'Automatic reordering',
    'Raise a draft replenishment for any service centre that is short of a part.'],
  ['points.product_register', '500', 'number', 'points',
    'Points for registering a device', null],
  ['points.daily_login', '10', 'number', 'points',
    'Points for signing in, once a day', null],
  ['points.license_cost', '1000', 'number', 'points',
    'Points a device licence costs', null],
  /*
   * What one unit of the Eshop's and the Appstore's native currency is worth in
   * the CRM's reporting currency. The CRM's Dream-wide spend adds those projects
   * to Crystal's, and nothing upstream converts them - see services/crm/vendorImport.
   */
  ['company.native_currency_rate', '0.01', 'number', 'company',
    'Native currency to reporting currency rate',
    'Used by the CRM to add Eshop and Appstore amounts paid in native currency to Dream-wide figures.'],
  ['company.name', 'Crystal Electronics', 'string', 'company',
    'Company name', 'Printed on job sheets and claim statements.'],
  ['company.support_phone', '400-820-0000', 'string', 'company',
    'Support hotline', null]
];

/**
 * PAGES IS EXPORTED - and, since the CRM, the role grids below it.
 *
 * It is the canonical list of the console's screens - `npm run pages:sync`
 * and the migration behind it (20260916110000) read it and add whatever an
 * existing database is missing, so a page added here reaches a machine that
 * was migrated rather than reseeded. knex calls `seed` and ignores the rest,
 * so the extra export costs nothing.
 *
 * The alternative was to repeat the list in a delta every time a screen is
 * added, which is how `/admin/base/footer` came to exist on a fresh install
 * and nowhere else.
 */
exports.PAGES = PAGES;

/*
 * THE ROLES AND THE PREFIX RULE, for the one migration that has to grant a
 * whole new group of pages to an install that already has its roles.
 *
 * syncPages grants a new page its PARENT's level - which is right for a page
 * added under an existing group and grants nothing for a new top-level group,
 * whose parent row does not exist yet. The CRM migration therefore reads each
 * role's grid from here, the way the seed does, rather than restating it.
 */
exports.ROLES = ROLES;
exports.levelFor = levelFor;

exports.seed = async function seed(knex) {
  /* ---- pages, parents resolved after insert so order does not matter ---- */
  const pageIds = {};

  for (let i = 0; i < PAGES.length; i += 1) {
    /*
     * The fifth element is `is_menu`, and it defaults to true.
     *
     * A page can be REGISTERED without being in the menu: the API guards on
     * it and grants inherit down its url prefix, but nobody navigates to it
     * directly. That is what the two section parents are.
     */
    const [url, name, icon, , isMenu] = PAGES[i];
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('manager_pages')
      .insert({
        page_url: url, page_name: name, icon: icon,
        is_menu: isMenu === undefined ? true : !!isMenu,
        sort_order: (i + 1) * 10
      })
      .returning('id');
    pageIds[url] = typeof rows[0] === 'object' ? rows[0].id : rows[0];
  }

  for (let i = 0; i < PAGES.length; i += 1) {
    const [url, , , parent] = PAGES[i];
    if (!parent) continue;
    // eslint-disable-next-line no-await-in-loop
    await knex('manager_pages').where('id', pageIds[url]).update({ parent_id: pageIds[parent] });
  }

  /* ---- roles and their grids ---- */
  const roleIds = {};

  for (let i = 0; i < ROLES.length; i += 1) {
    const role = ROLES[i];
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('manager_roles').insert({
      role_code: role.code,
      role_name: role.name,
      default_page: pageIds[role.home] || null,
      is_system: !!role.system
    }).returning('id');

    roleIds[role.code] = typeof rows[0] === 'object' ? rows[0].id : rows[0];

    const grid = Object.keys(pageIds).map(function (url) {
      return { role_id: roleIds[role.code], page_id: pageIds[url], permission: levelFor(role.grants, url) };
    }).filter(function (entry) { return entry.permission > 0; });

    // eslint-disable-next-line no-await-in-loop
    if (grid.length) await knex('manager_permissions').insert(grid);
  }

  /* ---- settings ---- */
  await knex('system_settings').insert(SETTINGS.map(function (row, i) {
    return {
      setting_key: row[0],
      setting_val: row[1],
      value_type: row[2],
      category: row[3],
      label: row[4],
      description: row[5],
      sort_order: (i + 1) * 10
    };
  }));

  /*
   * The accounts.
   *
   * One password for all of them because this is seed data for a development
   * database, and four different ones would only mean four things to look up
   * while trying to reproduce a permissions bug.
   *
   * A USERNAME AND A ROLE, and nothing else. There is no address column: the
   * console signs in on the username, so an email would be a unique nullable
   * field no query reads.
   */
  const passwordHash = bcrypt.hashSync('crystal1234', 10);

  await knex('managers').insert([
    { username: 'admin', name: 'Platform administrator',
      password_hash: passwordHash, role_id: roleIds.SUPER_ADMIN },
    { username: 'ops', name: 'Operations manager',
      password_hash: passwordHash, role_id: roleIds.OPS_MANAGER },
    { username: 'branch', name: 'Service centre manager',
      password_hash: passwordHash, role_id: roleIds.BRANCH_MANAGER },
    { username: 'editor', name: 'Content editor',
      password_hash: passwordHash, role_id: roleIds.EDITOR }
  ]);
};
