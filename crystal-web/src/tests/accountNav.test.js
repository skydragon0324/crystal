/*
 * EVERY MENU ENTRY HAS TO LEAD SOMEWHERE, and nothing else checked that.
 *
 * The account menu is a list of paths in accountNav.js; the routes are a
 * Switch in App.js. Nothing joins the two, so an entry pointing at a path with
 * no route does not error - it falls through to the catch-all redirect and
 * bounces the member to the dashboard with no explanation.
 *
 * Two entries were doing exactly that, "Repairs" and "My Articles", and both
 * had a working endpoint behind them the whole time. This is the check that
 * would have caught it.
 */
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

/** Every `to:` in the account menu, with the label that points at it. */
function menuEntries() {
  const source = read('components/account/accountNav.js');
  const found = [];
  const re = /\{ label: '([^']+)', to: '([^']+)'/g;

  let match = re.exec(source);
  while (match) {
    found.push({ label: match[1], to: match[2] });
    match = re.exec(source);
  }
  return found;
}

/**
 * The account routes, WITHOUT the `/account` wrapper.
 *
 * The wrapper is a prefix of every account path, so leaving it in makes any
 * comparison pass and the check useless.
 */
function accountRoutes() {
  const source = read('App.js');
  const found = [];
  const re = /exact path="(\/account[^"]*)"/g;

  let match = re.exec(source);
  while (match) {
    found.push(match[1]);
    match = re.exec(source);
  }
  return found;
}

/** A route matches a path when it is equal, allowing for one optional param. */
function resolves(to, routes) {
  return routes.some((route) => {
    if (route === to) return true;

    /*
     * A route ending in a parameter serves the path with that segment FILLED
     * IN - /account/wallet/:view? is what answers /account/wallet/charge - and,
     * when the parameter is optional, the bare path as well.
     */
    const param = route.match(/^(.*)\/:[^/]+?(\??)$/);
    if (!param) return false;

    const base = param[1];
    if (param[2] === '?' && base === to) return true;

    /* One more segment, and no deeper. */
    return to.indexOf(base + '/') === 0 && to.slice(base.length + 1).indexOf('/') === -1;
  });
}

test('every account menu entry has a route', () => {
  const entries = menuEntries();
  const routes = accountRoutes();

  expect(entries.length).toBeGreaterThan(10);
  expect(routes.length).toBeGreaterThan(10);

  const dead = entries.filter((entry) => !resolves(entry.to, routes));
  expect(dead.map((entry) => `${entry.label} -> ${entry.to}`)).toEqual([]);
});

test('every account route is reachable from the menu', () => {
  const entries = menuEntries();
  const routes = accountRoutes();

  /*
   * A route nothing links to is either a dead page or a missing menu entry,
   * and both are worth knowing about. The exceptions are the two ACTIONS:
   * `/account/products/register` is reached from the empty states and the
   * dashboard, and `/account/blog/write` from the member's own list of
   * articles and from the blog itself - which is where somebody is standing
   * when they decide to write one. Neither is a place in the menu.
   */
  const allowed = ['/account/products/register', '/account/blog/write'];

  const orphans = routes.filter((route) => {
    const base = route.replace(/\/:[^/]+\??$/, '');
    if (allowed.indexOf(base) !== -1) return false;
    return !entries.some((entry) => entry.to === base || entry.to === route);
  });

  expect(orphans).toEqual([]);
});

/* ------------------------------------------------------------------------ */
/*  which entry is open                                                      */
/* ------------------------------------------------------------------------ */

const { ACCOUNT_NAV, findAccountPage, hrefOf } = require('../components/account/accountNav');

/** Every entry that leads inside the site, with the group it is under. */
function allItems() {
  return ACCOUNT_NAV.reduce((out, group) => out.concat(
    group.items.filter((item) => !item.external).map((item) => ({ item, section: group.section }))
  ), []);
}

function at(address) {
  const parts = address.split('?');
  return findAccountPage(parts[0], parts[1] ? '?' + parts[1] : '');
}

test('Crystal Points is its own group: the wallet, its ledger, and what moves it', () => {
  /*
   * THE ORDER THE MEMBER ASKED FOR - what they hold, where it came from, then
   * the three things they can do to it - and the vendor's Points menu (charge,
   * transfer) is inside it. The wallet is here and no longer under Appstore:
   * one entry per page, or two rows would light up for one address.
   */
  const group = ACCOUNT_NAV.filter((entry) => entry.section === 'Crystal Points')[0];

  expect(group.items.map((item) => [item.label, hrefOf(item)])).toEqual([
    ['Wallet', '/account/wallet'],
    ['Point Log', '/account/points/crystal'],
    ['Transfer', '/account/wallet/transfer'],
    ['Charge', '/account/wallet/charge'],
    ['Wallet Password', '/account/wallet/password']
  ]);

  const appstore = ACCOUNT_NAV.filter((entry) => entry.section === 'Appstore')[0];
  expect(appstore.items.map((item) => item.label)).not.toContain('Wallet');
});

test('Software Points is the four software ledgers, and Activity is the vendor\'s two', () => {
  const software = ACCOUNT_NAV.filter((entry) => entry.section === 'Software Points')[0];
  const activity = ACCOUNT_NAV.filter((entry) => entry.section === 'Activity')[0];

  expect(software.items.map(hrefOf)).toEqual([
    '/account/points?source=APPSTORE',
    '/account/points?source=KARAOKE',
    '/account/points?source=MEDIA',
    '/account/points?source=SOFTWARE',
    '/account/history/karaoke',
    '/account/history/media'
  ]);
  expect(activity.items.map(hrefOf)).toEqual(['/account/points/activity', '/account/history/activity']);
});

test('no entry still sends Crystal\'s points or the activity log through the software page', () => {
  const stale = allItems().filter((entry) => (
    entry.item.params
      && ['CRYSTAL', 'ACTIVITY'].indexOf(String(entry.item.params.source).toUpperCase()) !== -1
  ));

  expect(stale.map((entry) => entry.item.label)).toEqual([]);
});

test('every entry is the one that lights up at its own address', () => {
  /*
   * THE SIDEBAR AND THE PHONE SHEET AGREE BY CONSTRUCTION. The sidebar bolds
   * findAccountPage's answer; the phone sheet navigates to hrefOf(item), and
   * the heading every account page draws - on a phone as on a desktop - is
   * findAccountPage's answer at the address it lands on. So one round trip,
   * the entry's own address resolving back to the entry, is both of them.
   *
   * It is also what catches the nested pages: /account/wallet is a prefix of
   * all three wallet forms and /account/points of Crystal's and the activity
   * log's pages, and a parent winning there would highlight the wrong row.
   */
  const wrong = allItems().filter((entry) => {
    const found = at(hrefOf(entry.item));
    return !found || found.label !== entry.item.label || found.section !== entry.section;
  });

  expect(wrong.map((entry) => entry.item.label + ' -> ' + JSON.stringify(at(hrefOf(entry.item))))).toEqual([]);

  const hrefs = allItems().map((entry) => hrefOf(entry.item));
  expect(hrefs.filter((href, index) => hrefs.indexOf(href) !== index)).toEqual([]);
});

test('each points page and each wallet form names the right entry', () => {
  const named = (address) => {
    const found = at(address);
    return found ? found.section + ' / ' + found.label : null;
  };

  expect(named('/account/points?source=KARAOKE')).toBe('Software Points / Karaoke');
  expect(named('/account/points?source=SOFTWARE')).toBe('Software Points / Minus');
  expect(named('/account/points/crystal')).toBe('Crystal Points / Point Log');
  expect(named('/account/points/activity')).toBe('Activity / Activity Point Log');
  expect(named('/account/wallet')).toBe('Crystal Points / Wallet');
  expect(named('/account/wallet/transfer')).toBe('Crystal Points / Transfer');
  expect(named('/account/wallet/charge')).toBe('Crystal Points / Charge');
  expect(named('/account/wallet/password')).toBe('Crystal Points / Wallet Password');

  /*
   * The bare software address names no ledger, because it is not a page: it
   * redirects to the first one (SoftwarePoints.js). A Software entry that lit
   * up there would be claiming a page the member never sees; what it falls to
   * is the Dashboard, the answer for any account address with no entry.
   */
  expect(named('/account/points')).toBe('Overview / Dashboard');
});

test('the old addresses that moved are redirects, and the new pages are routes', () => {
  const app = read('App.js');

  expect(app).toContain('<Redirect exact from="/account/wallet/security" to="/account/wallet/password" />');
  expect(app).toContain('<Route exact path="/account/points/crystal" component={CrystalPoints} />');
  expect(app).toContain('<Route exact path="/account/points/activity" component={ActivityPoints} />');
});
