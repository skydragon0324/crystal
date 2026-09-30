/*
 * IS THE ABOUT PAGE ACTUALLY TRANSLATED?
 *
 * Its copy does not go through the i18n catalogue - it is prose, fifteen
 * hundred words of it, and it lives in content.js with a Chinese mirror in
 * content.zh.js. That is the right shape for paragraphs, and it costs the one
 * thing the catalogue gave for free: nothing checks that the two agree.
 *
 * So it is checked here. The page rendered entirely in English for months
 * because nothing did.
 */
import { buildAbout } from '../pages/about/content';
import { LOCALES } from '../i18n';

/**
 * Every language that is a TRANSLATION - the switcher's list minus English.
 *
 * Derived rather than listed, so a locale added to LOCALES is held to this
 * from the moment it appears rather than from the moment somebody remembers.
 */
const TRANSLATIONS = LOCALES.map(function (entry) { return entry.code; })
  .filter(function (code) { return code !== 'en'; });

/**
 * Fields that are ADDRESSES rather than language.
 *
 * `featured` is the string 'true' - a flag inherited from the shape these
 * rows had in the database - and `key` names a column of the growth data.
 * Translating either would break the page rather than localise it.
 */
const ADDRESS = ['slot', 'image', 'icon', 'link', 'code', 'key', 'featured', 'id'];

/** Every string in a built page, with the path that reached it. */
function strings(node, at, out) {
  if (typeof node === 'string') {
    if (/[A-Za-z]{3}/.test(node)) out.push({ at, text: node });
    return out;
  }
  if (!node || typeof node !== 'object') return out;

  Object.keys(node).forEach((key) => {
    /*
     * Addresses, not language. A slot name, a file path, an icon and a link
     * are the same in every locale, and asserting they change would be
     * asserting the wrong thing.
     */
    if (ADDRESS.indexOf(key) !== -1) return;
    if (/^image_/.test(key)) return;

    strings(node[key], at ? at + '.' + key : key, out);
  });

  return out;
}

test('the English page is fully assembled', () => {
  const page = buildAbout(null, 'en');
  const found = strings(page, '', []);

  /* 144 once the overview became three milestones and the technology block titles only. */
  expect(found.length).toBeGreaterThan(130);
});

TRANSLATIONS.forEach((locale) => {
  test('every sentence on the page has been translated into ' + locale, () => {
  /*
   * Compared by PATH rather than by counting: a Chinese page with the same
   * number of strings could still have an English one in it, and that is
   * exactly what a half-finished chapter looks like.
   */
  const en = strings(buildAbout(null, 'en'), '', []);
  const other = buildAbout(null, locale);

  const translated = {};
  strings(other, '', []).forEach((entry) => { translated[entry.at] = entry.text; });

  /*
   * MAY be identical, not MUST.
   *
   * Product names and a standards body. A language is free to localise a
   * brand - Chinese writes Crystal Vision as 晶石视界 - and free to keep it in
   * Latin script, which is what Russian does here. The list says either is a
   * legitimate choice, not that the string cannot be translated.
   */
  const SAME_IN_EVERY_LANGUAGE = [
    'IPC',
    'Crystal OS',
    'Crystal OS 1.0',
    'Crystal Eshop',
    'Crystal Vision',
    'Crystal Care+',
    'SmartTV OS'
  ];

  const untranslated = en.filter((entry) => (
    translated[entry.at] === entry.text && SAME_IN_EVERY_LANGUAGE.indexOf(entry.text) === -1
  ));

    expect(untranslated.map((e) => e.at + ' = ' + e.text.slice(0, 40))).toEqual([]);
  });
});

test('a translation never loses a picture or a link', () => {
  /*
   * The merge copies string fields only, which is what keeps `link`, `slot`
   * and the image paths out of a language file. If that ever changes, a
   * chapter would go quietly imageless in one locale and not the other.
   */
  const en = buildAbout(null, 'en');
  const zh = buildAbout(null, 'zh');

  /* Every slot a translated page asks for is the one the English page asks for. */
  const slotsOf = (page) => JSON.stringify(page, (key, value) => value).match(/"slot":"[^"]+"/g);
  expect(slotsOf(zh)).toEqual(slotsOf(en));

  expect(zh.service.services.map((i) => i.icon || null))
    .toEqual(en.service.services.map((i) => i.icon || null));
});

test('an unknown locale still gets a complete page', () => {
  /* A language with no file falls back to the source rather than to blanks. */
  const en = buildAbout(null, 'en');
  const other = buildAbout(null, 'de');

  expect(other.overview.title).toBe(en.overview.title);
  expect(strings(other, '', []).length).toBe(strings(en, '', []).length);
});
