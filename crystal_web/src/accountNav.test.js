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

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

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
   * and both are worth knowing about. `/account/products/register` is the one
   * deliberate exception: it is reached from the empty states and the
   * dashboard rather than from the menu, because it is an action, not a place.
   */
  const allowed = ['/account/products/register'];

  const orphans = routes.filter((route) => {
    const base = route.replace(/\/:[^/]+\??$/, '');
    if (allowed.indexOf(base) !== -1) return false;
    return !entries.some((entry) => entry.to === base || entry.to === route);
  });

  expect(orphans).toEqual([]);
});
