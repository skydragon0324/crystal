import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import dictionaries from './dictionaries';
import { localeStore } from '@/api/client';

/**
 * The storefront's translations.
 *
 * SAME DESIGN AS THE CONSOLE AND THE API, deliberately - one idea to learn
 * rather than three. The key IS the English source text, so `t('Buy')` reads
 * as a sentence at the call site and a string nobody has translated still
 * shows as English rather than as a token like `product.buy`.
 *
 * ENGLISH HAS A DICTIONARY TOO. It did not, on the grounds that a dictionary
 * for the source language is a second copy of it - and the cost of that was
 * that changing one English word meant editing a component, which orphaned
 * its Chinese silently because the key moved with it. Every language is a
 * dictionary now; the lookup below is unchanged, because falling through to
 * the key is still exactly the right thing to do for an entry that is missing.
 *
 * Changing the language writes it to storage as well as to state, because
 * api/client reads it from there to set the X-Lang header - so the words this
 * site writes and the words the API writes change together, in one click.
 */

const I18nContext = createContext({
  locale: 'en',
  t: (key) => key,
  setLocale: () => {},
  intlLocale: 'en-GB'
});

export const LOCALES = [
  { code: 'en', label: 'English', short: 'EN', intl: 'en-GB' },
  { code: 'zh', label: '简体中文', short: '中文', intl: 'zh-CN' },
  { code: 'ru', label: 'Русский', short: 'RU', intl: 'ru-RU' }
];

function localeMeta(code) {
  return LOCALES.filter((entry) => entry.code === code)[0] || LOCALES[0];
}

/**
 * TWO WAYS TO ASK, and the second one is not a fallback for laziness.
 *
 *   'table.empty'   an ADDRESS - walked through the sections
 *   'Save'          ENGLISH TEXT - matched against the English catalogue
 *
 * The second exists because not every string that needs translating is
 * written at a call site. A menu label comes out of `manager_pages.page_name`,
 * a field label is declared in a page's `fields` array, a status comes back
 * from the API - and `t(item.label)` has no key to give. Those are matched by
 * their English, which is the only thing the caller has.
 *
 * A key that resolves to nothing comes back as itself. For an address that
 * shows the address, which is a visible, greppable bug; for English text it
 * shows the English, which is the right answer for an untranslated string.
 */
function lookup(dictionary, english, key) {
  if (!key) return key;

  /*
   * AN ADDRESS IS DOTTED AND HAS NO SPACES.
   *
   * The dot alone is not enough, and getting that wrong is silent: an English
   * SENTENCE ends in a full stop, so `t('Capacity below 80% of its rated
   * charge within the period.')` was walked as though `80% of its rated charge
   * within the period` were a section. It resolved to nothing, fell through
   * to the key, and rendered as English on a Chinese page - which is exactly
   * what a data-driven label is supposed to avoid.
   *
   * Every sentence passed to t() by value was affected; the warranty terms
   * and the About page are how it was found.
   */
  const address = String(key).indexOf('.') !== -1 && String(key).indexOf(' ') === -1;

  if (address) {
    const found = walk(dictionary, key);
    return found === undefined ? (walk(english, key) === undefined ? key : walk(english, key)) : found;
  }

  /*
   * By English text. The index is built once per catalogue rather than per
   * call - a linear scan of three hundred strings on every render of every
   * label is the sort of thing that only shows up on the slowest machine
   * somebody owns.
   */
  const byText = indexOf(dictionary, english);
  return byText[key] === undefined ? key : byText[key];
}

/** One step per dotted segment; undefined the moment a segment is missing. */
function walk(node, key) {
  const parts = String(key).split('.');
  let at = node;

  for (let i = 0; i < parts.length; i += 1) {
    if (!at || typeof at !== 'object') return undefined;
    at = at[parts[i]];
  }

  return typeof at === 'string' ? at : undefined;
}

/**
 * English text -> this locale's text, flattened from the two catalogues.
 *
 * Cached by the dictionary object itself, so it is built once per locale for
 * the life of the page and thrown away with it.
 */
const indexCache = new WeakMap();

function indexOf(dictionary, english) {
  if (indexCache.has(dictionary)) return indexCache.get(dictionary);

  const index = {};

  const visit = function (from, to) {
    Object.keys(from).forEach(function (name) {
      const source = from[name];
      const target = to ? to[name] : undefined;

      if (source && typeof source === 'object') {
        visit(source, target && typeof target === 'object' ? target : {});
      } else if (typeof source === 'string') {
        /* The English is the key; this locale's string is the answer. */
        index[source] = typeof target === 'string' ? target : source;
      }
    });
  };

  visit(english, dictionary);
  indexCache.set(dictionary, index);
  return index;
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(localeStore.get());

  const setLocale = useCallback((next) => {
    localeStore.set(next);
    setLocaleState(next);
  }, []);

  /**
   * `params` fills {name} placeholders AFTER the lookup, so a sentence is
   * translated whole rather than concatenated in an order that only works in
   * English - "3 results" and its Chinese equivalent do not put the number in
   * the same place.
   */
  const t = useCallback((key, params) => {
    const text = lookup(dictionaries[locale], dictionaries.en, key);

    if (!params) return text;
    return String(text).replace(/\{(\w+)\}/g, (whole, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
    ));
  }, [locale]);

  const meta = localeMeta(locale);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t,
    intlLocale: meta.intl
  }), [locale, setLocale, t, meta.intl]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** The common case: just the translator. */
export function useT() {
  return useContext(I18nContext).t;
}

export default I18nContext;
