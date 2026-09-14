/*
 * THE BAR OPENS THE SAME PANEL FROM EVERY HEADING.
 *
 * This was got wrong twice in opposite directions and both are worth
 * holding still:
 *
 *   ONLY TWO HEADINGS REACTED. Smartphones and Eproducts opened the panel
 *   because they had a category tree behind them; the other four did
 *   nothing. A bar that answers a hover on two of its six entries teaches
 *   the visitor it is not hoverable, and they stop trying the rest.
 *
 *   THEN EACH HEADING GOT ITS OWN COLUMNS. Which sounds better and is
 *   worse: the Eshop and the Appstore have no sections of their own, so
 *   they were given a list of the member's ACCOUNT pages - a menu about
 *   somewhere else entirely - and the panel changed shape under the pointer
 *   as it travelled along the bar.
 *
 * So: every heading opens it, and what it shows is the site's own menu.
 */
import { PRIMARY_LINKS } from './components/layout/siteNav';
import { buildMenu, menuColumns } from './components/layout/siteMenu';

/** A category tree shaped like the one GET /categories answers with. */
const CATEGORIES = [
  { id: 1, name: 'Crystal C9', slug: 'c9', type: 'SMARTPHONE', product_cnt: 4 },
  { id: 2, name: 'Televisions', slug: 'televisions', type: 'TV', product_cnt: 6 },
  { id: 3, name: 'Set-top boxes', slug: 'stb', type: 'STB', product_cnt: 3 }
];

test('every heading in the bar opens the panel', () => {
  const silent = PRIMARY_LINKS.filter((item) => !item.menu).map((item) => item.label);

  expect(silent).toEqual([]);
});

test('the panel shows the whole menu, whichever heading opened it', () => {
  /*
   * The columns are the site's structure and do not depend on where the
   * pointer is. Comparing every heading against `buildMenu` is what stops
   * somebody reintroducing a per-heading slice - the Eshop's account-page
   * menu is the shape this is guarding against.
   */
  const whole = buildMenu(CATEGORIES);
  expect(whole.length).toBeGreaterThan(0);

  PRIMARY_LINKS.forEach((item) => {
    expect(menuColumns(CATEGORIES, item.menu)).toEqual(whole);
  });
});

test('nothing hovered means nothing open', () => {
  /*
   * The panel's open state is "are there columns", so a null menu has to
   * answer with none - otherwise it hangs open under a bar nobody is
   * pointing at.
   */
  expect(menuColumns(CATEGORIES, null)).toEqual([]);
});

test('no heading offers the member their own account pages', () => {
  /*
   * THE ONE THAT WAS ASKED FOR TWICE.
   *
   * The Eshop and the Appstore columns were briefly a list of /account
   * routes. The bar is the site's public navigation; a member's own pages
   * are behind the account menu, and putting them in a heading labelled
   * Eshop tells a signed-out visitor that the Eshop is a login screen.
   *
   * IT ASKS `menuColumns`, PER HEADING - not `buildMenu`. What reaches the
   * screen is whatever the panel is handed for the heading being hovered,
   * and the first version of this test inspected the shared builder instead:
   * an account link added to one heading's own columns went straight past
   * it. That is precisely the mistake being guarded against.
   */
  const account = [];

  PRIMARY_LINKS.forEach((item) => {
    menuColumns(CATEGORIES, item.menu).forEach((column) => {
      column.links.forEach((link) => {
        if (link.to && link.to.indexOf('/account') === 0) {
          account.push(item.label + ' / ' + column.key + ' -> ' + link.to);
        }
      });
    });
  });

  expect(account).toEqual([]);
});

test('the two stores link to the stores', () => {
  /*
   * They open the panel like every other heading, and following them still
   * lands where the label says - which pointing them at /account/eshop/card
   * did not.
   */
  ['Eshop', 'Appstore'].forEach((label) => {
    const item = PRIMARY_LINKS.filter((entry) => entry.label === label)[0];

    expect(item).toBeTruthy();
    expect(item.external).toBe(true);
    expect(item.href).toMatch(/^https?:\/\//);
  });
});
