/*
 * The console speaks two languages, and this is what keeps it honest.
 *
 * A key is an ADDRESS now - `table.empty`, `catalog.products.hero` - held in
 * sections, so a string can be found by the screen that says it. That fixes
 * what the old flat catalogue could not: editing an English sentence used to
 * move its key and orphan the Chinese in silence.
 *
 * It also introduces a failure the flat form could not have: an address that
 * resolves to nothing renders as the address itself, which is a token on
 * screen where a sentence should be. The first test below is what catches it.
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
 * Derived rather than listed, so a locale added to LOCALES is held to all of
 * this from the moment it appears. These tests named zh directly, so a second
 * translation could have gone missing keys, dropped placeholders or sat
 * untranslated with everything still green.
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
    return out.concat(
      value && typeof value === 'object' ? flatten(value, at) : [at]
    );
  }, []);
}

/** Every string the console asks t() for as a literal. */
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

test('every locale the switcher offers has a dictionary, the source included', () => {
  /*
   * English has one now.
   *
   * It used to be asserted that it did NOT - a dictionary for the source
   * language is a second copy of it, free to drift - and the price was that
   * changing one English word meant editing a screen, which moved the key and
   * silently orphaned the Chinese hanging off it. The drift is now a checked
   * invariant instead of an argument: see the test below.
   */
  LOCALES.forEach((locale) => {
    expect(dictionaries[locale.code]).toBeTruthy();
  });
});

test('the dictionaries carry exactly the same keys', () => {
  /*
   * BOTH DIRECTIONS, and neither is the interesting one on its own: a key in
   * English and not in Chinese is an English word on a Chinese screen, and a
   * key in Chinese and not in English is a translation of a sentence this
   * console no longer writes. Nothing about either shows up in a build.
   */
  const en = flatten(dictionaries.en, '');

  TRANSLATIONS.forEach((locale) => {
    const other = flatten(dictionaries[locale], '');

    expect(other.filter((key) => en.indexOf(key) === -1)).toEqual([]);
    expect(en.filter((key) => other.indexOf(key) === -1)).toEqual([]);
  });
});

test('every address the console asks for resolves in both catalogues', () => {
  /*
   * A literal with a dot is an address and MUST resolve - an address that
   * does not is a token on screen. A literal without one is English text
   * being matched by value, which is legitimate and is checked separately.
   */
  const asked = translationKeys().filter((key) => key.indexOf('.') !== -1);
  expect(asked.length).toBeGreaterThan(200);

  const en = flatten(dictionaries.en, '');
  expect(asked.filter((key) => en.indexOf(key) === -1)).toEqual([]);

  TRANSLATIONS.forEach((locale) => {
    const other = flatten(dictionaries[locale], '');
    expect(asked.filter((key) => other.indexOf(key) === -1)).toEqual([]);
  });
});

test('nothing in the catalogue is written as a sentence', () => {
  /*
   * The regression this whole change exists to prevent: a key that is a
   * sentence rather than an address means somebody added an entry the old
   * way, and it will be unfindable again the moment there are four hundred.
   */
  const sentences = flatten(dictionaries.en, '')
    .filter((key) => key.split('.').some((part) => part.length > 40 || / /.test(part)));

  expect(sentences).toEqual([]);
});

test('every section a screen owns is named after that screen', () => {
  /*
   * Not a style rule - a findability one. The point of sections is that the
   * strings on one page sit together, and a section nobody can locate from a
   * file name defeats it.
   */
  const sections = Object.keys(dictionaries.en);

  expect(sections.length).toBeGreaterThan(10);
  expect(sections.filter((name) => !/^[a-z][A-Za-z0-9]*$/.test(name))).toEqual([]);

  /* The shared vocabularies the specification asks for, by name. */
  ['table', 'pagination', 'form', 'excel', 'datepicker', 'common'].forEach((name) => {
    expect(sections).toContain(name);
  });
});

/*
 * NO ORPHAN CHECK HERE, unlike the storefront, and the reason is worth
 * writing down: a large part of this catalogue translates copy that lives in
 * the DATABASE rather than in this repository.
 *
 * The sidebar is built from `manager_pages.page_name`, and the status badges
 * from codes the API sends, so `t('Warranty policies')` never appears in any
 * file here - the call site is `t(page.page_name)`. Asserting that every key
 * appears in src/ would fail on exactly the entries that are working.
 */

test('switching the locale changes the words', () => {
  let seen = null;

  function Probe() {
    const { t, locale, setLocale } = useI18n();
    seen = { text: t('signin.signIn'), locale, setLocale };
    return null;
  }

  const host = document.createElement('div');
  act(() => { ReactDOM.render(<I18nProvider><Probe /></I18nProvider>, host); });

  expect(seen.locale).toBe('en');
  expect(seen.text).toBe(dictionaries.en.signin.signIn);

  act(() => { seen.setLocale('zh'); });

  expect(seen.locale).toBe('zh');
  expect(seen.text).toBe(dictionaries.zh.signin.signIn);

  // And back, because a switcher that only goes one way is a trap.
  act(() => { seen.setLocale('en'); });
  expect(seen.text).toBe(dictionaries.en.signin.signIn);
});

test('the English on screen comes from the dictionary, not from the key', () => {
  /*
   * The whole point of English having a dictionary: a copy edit is an edit to
   * dictionaries.js and nothing else. The key stays as it is written at the
   * call site, so the Chinese hanging off it survives the change.
   */
  const original = dictionaries.en.signin.signIn;
  dictionaries.en.signin.signIn = 'Log in';

  try {
    let seen = null;

    function Probe() {
      seen = useI18n().t('signin.signIn');
      return null;
    }

    const host = document.createElement('div');
    act(() => { ReactDOM.render(<I18nProvider><Probe /></I18nProvider>, host); });

    expect(seen).toBe('Log in');
  } finally {
    dictionaries.en.signin.signIn = original;
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
   * `{n} of {part} are available` translated without the names renders as a
   * complaint about nothing in particular, and nothing catches it: the key
   * resolves and the text is Chinese. The reverse is worse - a placeholder
   * the English does not have renders as the literal `{n}` on screen.
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
   * it just passes the key-parity test above.
   *
   * Font names are the interesting exception: the rich text editor's list has
   * to keep the names the browser resolves, so 'Segoe UI' is 'Segoe UI' in
   * every language. Brands are the same.
   */
  const SAME_IN_EVERY_LANGUAGE = [
    /* Brands. */
    'Crystal', 'CRYSTAL', 'Crystal OS', 'Crystal App', 'Crystal app',
    'Eshop', 'Appstore', 'Care+', 'SLA',

    /*
     * Font names. The rich text editor's list has to carry the names the
     * browser actually resolves, so translating them would break the menu.
     */
    'Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia',
    'Helvetica', 'Inter', 'Segoe UI', 'Tahoma', 'Times New Roman',
    'Trebuchet MS', 'Verdana',

    /*
     * Slot names, quoted as an example of what to type into a field. They are
     * identifiers the page matches on, not words a reader is being told.
     */
    'hero, factory.floor, certificate'
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
      if (!/[A-Za-z]{3}/.test(entry.text)) return;
      if (SAME_IN_EVERY_LANGUAGE.indexOf(entry.text) !== -1) return;

      const other = entry.key.split('.')
        .reduce((at, part) => (at ? at[part] : undefined), dictionaries[locale]);

      if (other === entry.text) untranslated.push(locale + ': ' + entry.key);
    });
  });

  expect(untranslated).toEqual([]);
});
