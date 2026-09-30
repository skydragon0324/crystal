/*
 * THE SITE MENU IS ONE LIST, AND THE DESKTOP BAR IS THE PHONE'S MENU.
 *
 * This file used to hold the opposite position on the two stores, and the
 * history is worth keeping because it moved twice:
 *
 *   FIRST THE BAR'S Eshop AND Appstore WERE LINKS OUT, and the panel under
 *   every heading was built from the live category tree with a "Shop"
 *   column of two external links. "Don't show account menu items as the
 *   eshop and appstore menus" was the rule, and this file enforced it.
 *
 *   MEANWHILE THE PHONE'S Eshop BECAME A BRANCH - Cards, Orders and the rest
 *   of the member's Eshop pages, then "Open the Eshop" - because to a member
 *   the Eshop is part of Crystal and the external icon on the whole row said
 *   otherwise. Nothing compared the two menus, so they drifted apart.
 *
 *   THEN THE MEMBER ASKED FOR THE DESKTOP TO FOLLOW THE PHONE: "the main menu
 *   / eshop has submenus [on the phone], while for desktop it's only an
 *   external link. So do for appstore. Please review the mobile menu and make
 *   the same logic for desktop."
 *
 *   AND THEN BACK, ON BOTH: "revert to use original menu for eshop and
 *   appstore on desktop, I'd like to remove cards, orders, purchases
 *   submenus. Only eshop and appstore external link needed (without external
 *   link icon)". The member's own store pages are in the account menu, which
 *   is where somebody signed in looks for them; the headings are the shops.
 *   Support keeps two rows - FAQ and Contact us - while the rest of those
 *   pages wait to be advertised.
 *
 * So both are drawn from siteNav.SITE_NAV now. What is held here is the list
 * itself; tests/menuParity.test.js mounts the two menus and holds what they
 * DRAW to it.
 */
import { EXTERNAL, PHONE_BRANCHES, SITE_BAR, SITE_BRANCHES, SITE_NAV, currentEntry } from '../components/layout/siteNav';
import { ACCOUNT_NAV, hrefOf } from '../components/account/accountNav';

const fs = require('fs');
const path = require('path');

const byKey = (key) => SITE_NAV.filter((entry) => entry.key === key)[0];

test('the menu is the spec\'s, in the spec\'s order', () => {
  /*
   * "Login/SignUp, Smartphones, Eproducts, Eshop, Appstore, Support, Blog,
   * About." The account row is not in the list - it depends on who is
   * looking - so the rest is.
   */
  expect(SITE_NAV.map((entry) => entry.label)).toEqual([
    'Smartphones', 'Eproducts', 'Eshop', 'Appstore', 'Shop', 'Support', 'Blog', 'About'
  ]);
});

test('the desktop bar is the menu, in its order, and leaves out only Support', () => {
  /*
   * "Remove the support header button" - the one heading the bar does not
   * carry. Anything else missing from the bar is the drift this list exists to
   * stop, so the exception is named rather than counted.
   */
  const left = SITE_NAV.filter((entry) => SITE_BAR.indexOf(entry) === -1).map((entry) => entry.key);

  /* Support waits to be advertised; Shop is a panel column the bar says twice otherwise. */
  expect(left).toEqual(['shop', 'support']);
  expect(SITE_BAR.map((entry) => entry.key)).toEqual(
    SITE_NAV.map((entry) => entry.key).filter((key) => ['shop', 'support'].indexOf(key) === -1)
  );
});

test('every entry opens, or goes to a page, or goes to a store - exactly one of the three', () => {
  const ways = (entry) => [!!entry.links, !!entry.to, !!entry.external].filter(Boolean).length;
  const wrong = SITE_NAV.filter((entry) => ways(entry) !== 1).map((entry) => entry.key);

  expect(wrong).toEqual([]);
  expect(SITE_BRANCHES.map((entry) => entry.key)).toEqual(['smartphones', 'eproducts', 'shop', 'support']);

  /* And the phone drills into the ones that are rows on it: not Shop, not Support. */
  expect(PHONE_BRANCHES.map((entry) => entry.key)).toEqual(['smartphones', 'eproducts']);
});

test('the two stores are one link each, straight to the store', () => {
  [['eshop', 'Eshop', EXTERNAL.eshop], ['appstore', 'Appstore', EXTERNAL.appstore]]
    .forEach(([key, label, store]) => {
      /*
       * NOTHING TO OPEN AND NOTHING TO EXPLAIN: the heading is the shop.
       * The member's own pages for it are in the account menu, and the
       * renderers draw this entry with no external-link icon - which is
       * the part menuParity.test.js holds, because it is about the markup.
       */
      expect(byKey(key)).toEqual({ key, label, href: store, external: true });
    });
});

test('the member\'s store pages are in the account menu, and only there', () => {
  /*
   * Cards, Orders, Purchases and the rest belong to the member, so they are
   * the account menu's Eshop and Appstore groups - and the site menu does
   * not repeat them. This is what would catch somebody pasting them back.
   */
  const group = (section) => ACCOUNT_NAV.filter((entry) => entry.section === section)[0]
    .items.map((item) => hrefOf(item));

  expect(group('Eshop').length).toBeGreaterThan(1);
  expect(group('Appstore').length).toBeGreaterThan(1);

  const inSiteMenu = SITE_NAV.reduce((out, entry) => out
    .concat((entry.links || []).filter((link) => !link.external).map((link) => link.to)), []);
  expect(inSiteMenu.filter((to) => String(to).indexOf('/account/') === 0)).toEqual([]);
});

/* ------------------------------------------------------------------------ */
/*  every link leads somewhere                                              */
/* ------------------------------------------------------------------------ */

/** Every `path="..."` the application routes, from App.js. */
function routes() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const found = [];
  const re = /\bpath="([^"]+)"/g;

  let match = re.exec(source);
  while (match) {
    found.push(match[1]);
    match = re.exec(source);
  }
  return found;
}

/** Does a route pattern serve this path? `:name` is one segment, `:name?` may be absent. */
function serves(route, to) {
  const want = to.split('?')[0].split('/').filter(Boolean);
  const have = route.split('/').filter(Boolean);

  const required = have.filter((part) => !/^:.+\?$/.test(part)).length;
  if (want.length < required || want.length > have.length) return false;

  return want.every((part, index) => have[index].charAt(0) === ':' || have[index] === part);
}

test('every page the menu links to is a route', () => {
  /*
   * A link to an address with no route does not fail - it falls through to
   * the catch-all and lands somewhere the label never promised.
   */
  const all = routes();
  expect(all.length).toBeGreaterThan(20);

  const links = SITE_NAV.reduce((out, entry) => out
    .concat(entry.to ? [entry.to] : [])
    .concat((entry.links || []).filter((link) => !link.external).map((link) => link.to)), []);

  const dead = links.filter((to) => !all.some((route) => serves(route, to)));
  expect(dead).toEqual([]);
});

test('the bar marks the section the reader is in', () => {
  /*
   * The longest matching address wins, so the pages Smartphones borrows from
   * /support stay Smartphones'. The stores match nothing: they are another
   * site, and the account pages under them belong to the account menu.
   */
  expect(currentEntry('/smartphones')).toBe('smartphones');
  expect(currentEntry('/smartphones/products/c9-pro')).toBe('smartphones');
  expect(currentEntry('/support/os')).toBe('smartphones');
  expect(currentEntry('/support/centres/eproducts')).toBe('eproducts');
  expect(currentEntry('/eproducts/televisions')).toBe('eproducts');
  expect(currentEntry('/support/faq')).toBe('support');
  expect(currentEntry('/account/eshop/orders')).toBeNull();
  expect(currentEntry('/account/appstore/purchases')).toBeNull();
  expect(currentEntry('/blog/a-post')).toBe('blog');
  expect(currentEntry('/')).toBeNull();
  /* A prefix is not a parent: /blogger is not the blog. */
  expect(currentEntry('/blogger')).toBeNull();
});
