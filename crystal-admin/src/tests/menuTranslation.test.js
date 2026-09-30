/*
 * THE SIDE MENU IS THE LEAST TRANSLATED THING ON THE SCREEN, and it was
 * invisible because of how the fallback works.
 *
 * Menu labels are not written in this repository. They are `page_name` on the
 * `manager_pages` rows, and the sidebar, the page jumper and the page title
 * all render them with `t(page.page_name)` - a lookup with no address to give,
 * resolved against the English catalogue's VALUES.
 *
 * When that misses, the lookup returns the key. The key IS the English. So a
 * Chinese console rendered a tidy, correct-looking English menu down its whole
 * left side: nothing blank, nothing broken, nothing logged. Thirty-eight of
 * the fifty-three entries were like that.
 *
 * THE NAMES ARE READ FROM THE SEED, not copied into this file. A copy is a
 * second list to keep in step, and the failure it is guarding against is
 * exactly "somebody added a page and did not think about the dictionary" -
 * which a stale copy would sail straight past.
 */
import dictionaries from '../i18n/dictionaries';

const fs = require('fs');
const path = require('path');

const SEED = path.join(
  __dirname, '..', '..', '..', 'crystal-backend', 'src', 'db', 'seeds', '01_management.js'
);

/** The page names the console's menu is built from. */
function pageNames() {
  const source = fs.readFileSync(SEED, 'utf8');

  const start = source.indexOf('const PAGES = [');
  const end = source.indexOf('\n];', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  /* eslint-disable no-eval */
  const rows = eval(source.slice(start + 'const PAGES = '.length, end + 2));
  /* eslint-enable no-eval */

  return rows.map((row) => row[1]).filter(Boolean);
}

/** Every English string in the catalogue, as a set. */
function englishValues(node, found) {
  const out = found || {};

  Object.keys(node || {}).forEach((name) => {
    const value = node[name];
    if (value && typeof value === 'object') englishValues(value, out);
    else if (typeof value === 'string') out[value] = true;
  });

  return out;
}

test('the seed still declares the menu this test can read', () => {
  /* If the seed is restructured this test must fail loudly rather than
     quietly checking an empty list and passing. */
  expect(pageNames().length).toBeGreaterThan(40);
});

test('every page name in the menu has a translation', () => {
  const english = englishValues(dictionaries.en);
  const missing = pageNames().filter((name) => !english[name]);

  expect(missing).toEqual([]);
});

test('and it is translated in every language, not just present in English', () => {
  /*
   * Presence in the English catalogue is only half of it: the value index maps
   * English -> this locale's string, and an entry whose Chinese is missing
   * falls back to the English. So the check is that the menu entry resolves to
   * something DIFFERENT in Chinese - except for the names that are the same in
   * every language, which are product names rather than words.
   */
  const SAME_IN_EVERY_LANGUAGE = ['Crystal', 'Crystal OS', 'Eshop', 'Appstore', 'Eproduct', 'FAQ', 'Blog'];

  const index = (dictionary) => {
    const map = {};
    const visit = (from, to) => {
      Object.keys(from).forEach((name) => {
        const source = from[name];
        const target = to ? to[name] : undefined;
        if (source && typeof source === 'object') {
          visit(source, target && typeof target === 'object' ? target : {});
        } else if (typeof source === 'string') {
          map[source] = typeof target === 'string' ? target : source;
        }
      });
    };
    visit(dictionaries.en, dictionary);
    return map;
  };

  const zh = index(dictionaries.zh);
  const untranslated = pageNames().filter((name) => (
    SAME_IN_EVERY_LANGUAGE.indexOf(name) === -1 && zh[name] === name
  ));

  expect(untranslated).toEqual([]);
});
