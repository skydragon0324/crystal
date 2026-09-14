/*
 * The storefront speaks two languages, and this is what keeps it honest.
 *
 * The keys ARE the English copy, which is what makes the catalogue readable
 * and a missing entry harmless - but it also means editing a sentence orphans
 * its translation silently. Nothing about that is visible in a build, so it is
 * asserted here instead.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import fs from 'fs';
import path from 'path';

import { I18nProvider, useI18n, LOCALES } from './i18n';
import dictionaries from './i18n/dictionaries';

const SRC = __dirname;

/**
 * Every language that is a TRANSLATION - the switcher's list minus the source.
 *
 * Written as a derivation rather than a list, so a locale added to LOCALES is
 * held to all of this from the moment it appears. These tests named zh
 * directly, so a second translation could have gone missing keys, dropped
 * placeholders or sat untranslated with everything still green.
 */
const TRANSLATIONS = LOCALES.map((entry) => entry.code).filter((code) => code !== 'en');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every leaf of a sectioned catalogue, as dotted keys. */
function flatten(node, prefix) {
  return Object.keys(node).reduce((out, name) => {
    const at = prefix ? prefix + '.' + name : name;
    const value = node[name];
    return out.concat(value && typeof value === 'object' ? flatten(value, at) : [at]);
  }, []);
}

/** Every string the app asks t() for. */
function translationKeys() {
  const keys = new Set();
  const call = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;

  walk(SRC).forEach((file) => {
    if (/[\\/]i18n[\\/]/.test(file)) return;
    const code = fs.readFileSync(file, 'utf8');

    let match = call.exec(code);
    while (match) {
      keys.add(match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
      match = call.exec(code);
    }
  });

  return [...keys];
}

/*
 * Copy that is DATA rather than language: a demo serial number, a sample
 * address, an example email. Translating those would be wrong, so they are
 * named here instead of quietly failing the coverage assertion.
 */
const NOT_LANGUAGE = [
  'CR1A2B3C4D5E',
  'demo@crystal.example',
  '318 Nanjing East Road'
];

test('every locale the switcher offers has a dictionary, the source included', () => {
  /*
   * English has one now.
   *
   * It used to be asserted that it did NOT - a dictionary for the source
   * language is a second copy of it, free to drift - and the price was that
   * changing one English word meant editing a component, which moved the key
   * and silently orphaned the Chinese hanging off it. The drift is now a
   * checked invariant instead of an argument: see the test below.
   */
  LOCALES.forEach((locale) => {
    expect(dictionaries[locale.code]).toBeTruthy();
  });
});

test('the dictionaries carry exactly the same keys', () => {
  /*
   * BOTH DIRECTIONS, and neither is the interesting one on its own: a key in
   * English and not in Chinese is an English word on a Chinese page, and a key
   * in Chinese and not in English is a translation of a sentence this
   * application no longer writes. Nothing about either shows up in a build.
   */
  const en = Object.keys(dictionaries.en);

  TRANSLATIONS.forEach((locale) => {
    const other = Object.keys(dictionaries[locale]);

    expect(other.filter((key) => en.indexOf(key) === -1)).toEqual([]);
    expect(en.filter((key) => other.indexOf(key) === -1)).toEqual([]);
  });
});

test('every address the app asks for resolves in both catalogues', () => {
  /*
   * A literal with a dot is an ADDRESS and must resolve - one that does not
   * renders as the address itself, a token where a sentence should be. A
   * literal without one is English being matched by value, which is how a
   * data-driven label reaches the catalogue and is checked below.
   */
  const asked = translationKeys()
    .filter((key) => NOT_LANGUAGE.indexOf(key) === -1)
    .filter((key) => key.indexOf('.') !== -1);

  expect(asked.length).toBeGreaterThan(300);

  const en = flatten(dictionaries.en, '');
  expect(asked.filter((key) => en.indexOf(key) === -1)).toEqual([]);

  TRANSLATIONS.forEach((locale) => {
    const other = flatten(dictionaries[locale], '');
    expect(asked.filter((key) => other.indexOf(key) === -1)).toEqual([]);
  });
});

test('the catalogue is sections, not sentences', () => {
  /*
   * The regression this change exists to prevent: an entry added the old way,
   * whose key is the copy. It is unfindable the moment there are four hundred
   * of them, and editing the copy makes the key wrong.
   */
  const sentences = flatten(dictionaries.en, '')
    .filter((key) => key.split('.').some((part) => / /.test(part) || part.length > 40));

  expect(sentences).toEqual([]);

  const sections = Object.keys(dictionaries.en);
  expect(sections.length).toBeGreaterThan(8);
  expect(sections.filter((name) => !/^[a-z][A-Za-z0-9]*$/.test(name))).toEqual([]);
});

test('nothing in the catalogue is unreachable', () => {
  /*
   * AN ENTRY NOTHING CAN REACH is dead weight that reads as coverage. There
   * are exactly two ways to reach one, and this checks for both:
   *
   *   BY ADDRESS   the key is written at a call site - t('common.smartphones')
   *   BY ENGLISH   the English text appears in the source as a literal, which
   *                is how a data-driven label arrives: a nav model or an
   *                option list declares 'Smartphones', and the call site is
   *                t(item.label) with no key to grep for.
   *
   * This used to read Object.keys(dictionaries.zh) - which, now that the
   * catalogue is sections, returns the SECTION NAMES and finds every one of
   * them in the source. It asserted nothing. Reading the leaves is the point.
   */
  /*
   * STRING LITERALS, not the raw source text.
   *
   * Searching the whole file for the English also finds it in a COMMENT, so
   * an entry explained in prose above the code counted as reached by the
   * prose. Only a literal can actually arrive at t() as data, which is the
   * difference between an entry being mentioned and an entry being used.
   */
  const literals = new Set();

  walk(SRC)
    .filter((file) => !/[\/]i18n[\/]dictionaries./.test(file) && !/i18n.test./.test(file))
    .forEach((file) => {
      const code = fs.readFileSync(file, 'utf8');
      const str = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;

      let match = str.exec(code);
      while (match !== null) {
        /*
         * Unescaped, because an apostrophe inside a single-quoted literal is
         * written \' in the file - comparing the raw form would report every
         * sentence containing one as unreachable.
         */
        const value = (match[1] !== undefined ? match[1] : match[2])
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\');

        if (value) literals.add(value);
        match = str.exec(code);
      }
    });

  const asked = new Set(translationKeys());

  const unreachable = flatten(dictionaries.en, '').filter((key) => {
    if (asked.has(key)) return false;

    const english = key.split('.').reduce((at, part) => (at ? at[part] : undefined), dictionaries.en);
    return typeof english === 'string' && !literals.has(english);
  });

  expect(unreachable).toEqual([]);
});

test('switching the locale changes the words', () => {
  let seen = null;

  function Probe() {
    const { t, locale, setLocale } = useI18n();
    seen = { text: t('common.smartphones'), locale, setLocale };
    return null;
  }

  const host = document.createElement('div');
  act(() => { ReactDOM.render(<I18nProvider><Probe /></I18nProvider>, host); });

  expect(seen.locale).toBe('en');
  expect(seen.text).toBe(dictionaries.en.common.smartphones);

  act(() => { seen.setLocale('zh'); });

  expect(seen.locale).toBe('zh');
  expect(seen.text).toBe('智能手机');
  // And back, because a switcher that only goes one way is a trap.
  act(() => { seen.setLocale('en'); });
  expect(seen.text).toBe('Smartphones');
});

test('the English on screen comes from the dictionary, not from the key', () => {
  /*
   * The whole point of English having a dictionary: a copy edit is an edit to
   * dictionaries.js and nothing else. The key stays as it is written at the
   * call site, so the Chinese hanging off it survives the change.
   */
  const original = dictionaries.en.common.smartphones;
  dictionaries.en.common.smartphones = 'Phones';

  try {
    let seen = null;

    function Probe() {
      seen = useI18n().t('common.smartphones');
      return null;
    }

    const host = document.createElement('div');
    act(() => { ReactDOM.render(<I18nProvider><Probe /></I18nProvider>, host); });

    expect(seen).toBe('Phones');
  } finally {
    dictionaries.en.common.smartphones = original;
  }
});

test('a placeholder is filled after the lookup, not before', () => {
  let t = null;

  function Probe() {
    t = useI18n().t;
    return null;
  }

  const host = document.createElement('div');
  act(() => { ReactDOM.render(<I18nProvider><Probe /></I18nProvider>, host); });

  // An untranslated key falls through as its own English text, placeholders
  // included - which is what makes a half-finished catalogue harmless.
  expect(t('{count} results', { count: 3 })).toBe('3 results');
  expect(t('{missing} stays', {})).toBe('{missing} stays');
});

test('a translation keeps every placeholder its English has', () => {
  /*
   * A DROPPED PLACEHOLDER IS A SENTENCE WITH A HOLE IN IT.
   *
   * `{store} did not answer` translated without the {store} renders as a
   * complaint about nothing in particular, and nothing catches it: the key
   * resolves, the text is Chinese, and the value it was supposed to name is
   * simply gone. One entry lost its {store} to a copy-paste while these
   * catalogues were being filled in, which is what this exists to catch.
   *
   * The reverse - a placeholder the English does not have - is worse still:
   * it renders as the literal `{store}` on screen, because nothing passes a
   * value for it.
   */
  const holes = [];

  const walkPair = (english, other, prefix) => {
    Object.keys(english).forEach((name) => {
      const at = prefix ? prefix + '.' + name : name;
      const source = english[name];
      const target = other ? other[name] : undefined;

      if (source && typeof source === 'object') {
        walkPair(source, target && typeof target === 'object' ? target : {}, at);
        return;
      }

      if (typeof source !== 'string' || typeof target !== 'string') return;

      const names = (text) => (text.match(/\{(\w+)\}/g) || []).sort().join(',');

      if (names(source) !== names(target)) {
        holes.push(at + ': English has [' + names(source) + '], ' + prefix.split('.')[0] + ' has [' + names(target) + ']');
      }
    });
  };

  TRANSLATIONS.forEach((locale) => {
    walkPair(dictionaries.en, dictionaries[locale], locale);
  });

  expect(holes).toEqual([]);
});

test('every entry that can be translated has been', () => {
  /*
   * An entry present in zh and IDENTICAL to the English is not translated -
   * it just passes the key-parity test, which is why that test alone left
   * seventy-four English sentences on Chinese screens.
   *
   * The exceptions are named rather than inferred. A brand is a brand in
   * every language, and sample data is data.
   */
  /*
   * MAY be identical, not MUST.
   *
   * These are product names and sample data. A language is free to localise a
   * brand - Chinese writes Crystal Eshop as 晶石商城 - and free to leave it in
   * Latin script, which is what Russian does. The list says the choice is
   * legitimate either way; it does not say the string is untranslatable.
   */
  const SAME_IN_EVERY_LANGUAGE = [
    'Crystal',
    'Crystal: ',
    'Crystal OS',
    'CRYSTAL OS',
    'Crystal Eshop',
    'Crystal Appstore',
    'Eshop',
    'Appstore',
    'Eproduct',
    'demo.crystal',
    'demo@crystal.example',
    'CR1A2B3C4D5E'
  ];

  const english = [];
  const collect = (node, prefix) => {
    Object.keys(node).forEach((name) => {
      const at = prefix ? prefix + '.' + name : name;
      if (node[name] && typeof node[name] === 'object') collect(node[name], at);
      else english.push({ key: at, text: node[name] });
    });
  };
  collect(dictionaries.en, '');

  const untranslated = [];

  TRANSLATIONS.forEach((locale) => {
    english.forEach((entry) => {
      if (typeof entry.text !== 'string') return;
      /* Nothing to translate in "24/7" or "C9". */
      if (!/[A-Za-z]{3}/.test(entry.text)) return;
      if (SAME_IN_EVERY_LANGUAGE.indexOf(entry.text) !== -1) return;

      const other = entry.key.split('.')
        .reduce((at, part) => (at ? at[part] : undefined), dictionaries[locale]);

      if (other === entry.text) untranslated.push(locale + ': ' + entry.key);
    });
  });

  expect(untranslated).toEqual([]);
});
