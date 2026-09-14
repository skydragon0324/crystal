/*
 * FOUR THINGS HAVE TO AGREE FOR A SCREEN TO WORK, and each half builds and
 * passes on its own:
 *
 *   routes.js        the screen exists at a path
 *   manager_pages    the path is registered, or requirePermission answers 403
 *   PAGE constants   the page a screen declares matches the path it routes to
 *   REDIRECTS        a permission page that is not a screen still resolves
 *
 * The bug that prompted this: three permissions cover two screens each -
 * products, service centres and repair pricing all split into a smartphone
 * page and an eproduct page - so `/admin/catalog/products` is a real page url
 * that nothing routed to. A role LANDS on a page url, the roles screen offers
 * every registered page as its landing page, and the seed already picked that
 * one for the content editor. The router's catch-all sent them to the
 * dashboard, so the setting looked applied and did nothing.
 *
 * The seed is read directly rather than the database, because this runs
 * without one - and the seed is what a fresh install gets.
 */
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const SEED = path.join(
  SRC, '..', '..', 'crystal-backend', 'src', 'db', 'seeds', '01_management.js'
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((out, entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return out.concat(walk(full));
    return /\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)
      ? out.concat([full])
      : out;
  }, []);
}

const routesJs = read(path.join(SRC, 'routes.js'));

/** Every path the router matches, detail routes included. */
const routed = (routesJs.match(/path: '([^']+)'/g) || [])
  .map((m) => m.match(/'([^']+)'/)[1]);

/** Every path a screen can be reached at: routed, or redirected to one. */
const redirected = (routesJs.match(/from: '([^']+)'/g) || [])
  .map((m) => m.match(/'([^']+)'/)[1]);

const reachable = routed.concat(redirected);

/* The page rows a fresh install registers. */
const seed = fs.existsSync(SEED) ? read(SEED) : null;

test('every screen the console routes to is a registered page', () => {
  /*
   * A screen with no page row renders and then refuses to load: the API
   * answers 403 for a page that is not in manager_pages, which reads as a
   * permissions problem rather than as a missing row.
   */
  if (!seed) return;

  const registered = (seed.match(/\['(\/admin\/[^']+)'/g) || [])
    .map((m) => m.match(/'([^']+)'/)[1]);

  const missing = routed
    /* A detail route reads its permission from the list it sits under. */
    .filter((url) => url.indexOf(':') === -1)
    .filter((url) => registered.indexOf(url) === -1);

  expect(missing).toEqual([]);
});

test('every page a role can land on actually resolves', () => {
  /*
   * THE BUG THIS FILE EXISTS FOR.
   *
   * The roles screen offers every registered page as "lands on after signing
   * in", so any page url can become a landing page. One that neither routes
   * nor redirects hits the catch-all and goes to the dashboard, silently.
   *
   * Menu GROUPS are excluded: `/admin/catalog` is a heading with no screen of
   * its own, and it is two segments deep. Anything deeper claims to be a
   * screen and has to behave like one.
   */
  if (!seed) return;

  const registered = (seed.match(/\['(\/admin\/[^']+)'/g) || [])
    .map((m) => m.match(/'([^']+)'/)[1]);

  const screens = registered.filter((url) => url.split('/').length > 3);
  const dead = [...new Set(screens)].filter((url) => reachable.indexOf(url) === -1);

  expect(dead).toEqual([]);
});

test('a role whose landing page is set in the seed can reach it', () => {
  /* The seed ships one of these; it should not ship a broken one. */
  if (!seed) return;

  const homes = (seed.match(/home: '([^']+)'/g) || [])
    .map((m) => m.match(/'([^']+)'/)[1]);

  expect(homes.length).toBeGreaterThan(0);
  expect(homes.filter((url) => reachable.indexOf(url) === -1)).toEqual([]);
});

test('a PAGE constant names a path the router knows', () => {
  /*
   * The screen reads its permission from this constant and the router matches
   * on the path. When they disagree the guard checks one page and the reader
   * opened another.
   */
  const wrong = [];

  walk(path.join(SRC, 'pages')).forEach((file) => {
    const found = read(file).match(/export const PAGE = '([^']+)'/);
    if (!found) return;

    if (reachable.indexOf(found[1]) === -1) {
      wrong.push(path.relative(SRC, file).split(path.sep).join('/') + ' -> ' + found[1]);
    }
  });

  expect(wrong).toEqual([]);
});

test('a redirect points at a screen that exists', () => {
  const broken = (routesJs.match(/to: '([^']+)'/g) || [])
    .map((m) => m.match(/'([^']+)'/)[1])
    .filter((url) => routed.indexOf(url) === -1);

  expect(broken).toEqual([]);
});
