import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import dictionaries from './dictionaries';
import { localeStore } from '../api/client';

/**
 * The console's own translations.
 *
 * A KEY IS AN ADDRESS, not a sentence: `t('table.empty')`, not
 * `t('Nothing here yet')`. The English used to be the key, which read well at
 * the call site and made one string impossible to find among four hundred -
 * and editing an English word moved the key, orphaning its Chinese in
 * silence. Sections are the fix; see i18n/dictionaries.js for how they are
 * decided.
 *
 * ENGLISH HAS A DICTIONARY TOO. It did not, on the grounds that a dictionary
 * for the source language is a second copy of it - and the cost of that was
 * that changing one English word meant editing a screen, which orphaned its
 * Chinese silently because the key moved with it. Every language is a
 * dictionary now; the lookup below is unchanged, because falling through to
 * the key is still exactly the right thing to do for an entry that is missing.
 *
 * Changing the language also writes it to storage, because api/client reads
 * it from there when it sets the X-Lang header - so the words the console
 * writes and the words the API writes change together, in one click.
 */

const I18nContext = createContext({
  locale: 'en',
  t: (key) => key,
  setLocale: () => {},
  intlLocale: 'en-GB',
  weekStartsOn: 1
});

/**
 * Each locale carries what Intl needs as well as what the dictionary does.
 *
 * The "intl" tag is what the browser's own formatters take - a date picker
 * asks it for month and weekday names rather than shipping a table of them -
 * and "weekStartsOn" is which column Monday sits in.  Both locales start the
 * week on Monday: this is a business tool, and a working week that begins
 * mid-column is harder to read than one that does not.
 */
export const LOCALES = [
  { code: 'en', label: 'English', intl: 'en-GB', weekStartsOn: 1 },
  { code: 'zh', label: '简体中文', intl: 'zh-CN', weekStartsOn: 1 },
  { code: 'ru', label: 'Русский', intl: 'ru-RU', weekStartsOn: 1 }
];

function localeMeta(code) {
  return LOCALES.filter(function (entry) { return entry.code === code; })[0] || LOCALES[0];
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
   * The dot alone is not enough, and getting it wrong is silent: an English
   * SENTENCE ends in a full stop, so a label passed by value was walked as
   * though the words after the stop were a section. It resolved to nothing,
   * fell through to the key, and rendered as English on a Chinese screen -
   * which is exactly what matching by English text exists to prevent.
   *
   * The console reaches this path constantly: `t(page.page_name)` and
   * `t(column.label)` have no key to write, only the words.
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
   * `params` fills {name} placeholders after the lookup, so a sentence can be
   * translated whole instead of being concatenated in an order that only
   * works in English.
   */
  const t = useCallback((key, params) => {
    const text = lookup(dictionaries[locale], dictionaries.en, key);

    if (!params) return text;
    return String(text).replace(/\{(\w+)\}/g, (whole, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
    );
  }, [locale]);

  const meta = localeMeta(locale);

  const value = useMemo(() => ({
    locale: locale,
    setLocale: setLocale,
    t: t,
    intlLocale: meta.intl,
    weekStartsOn: meta.weekStartsOn
  }), [locale, setLocale, t, meta.intl, meta.weekStartsOn]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** The common case: a component that only needs the translate function. */
export function useT() {
  return useContext(I18nContext).t;
}

export default I18nContext;
