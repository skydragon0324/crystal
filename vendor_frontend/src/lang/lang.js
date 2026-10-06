/**
 * Internationalisation runtime.
 *
 * What this replaces
 * ------------------
 * The previous version was four lines: it `require`d the English
 * dictionary directly, and returned `""` for anything it could not find.
 * That had three consequences worth naming, because they are the reason
 * this file exists:
 *
 *   1. A mistyped or missing key rendered as empty space. Nothing failed,
 *      nothing logged - a label simply vanished. Several are documented in
 *      constants.js, where six entries referenced names the dictionary
 *      never had.
 *   2. `replacements.shift()` mutated the caller's array, so any array
 *      that was not a throwaway literal came back emptied.
 *   3. English was the only reachable language, and the domain label maps
 *      were read at module load by constants.js, which froze them into
 *      module constants for the life of the page.
 *
 * What it does now
 * ----------------
 *   - a locale registry with a fallback chain, so a partial translation
 *     shows English for what it is missing rather than blanks
 *   - a missing key returns the key itself and warns once, so the gap is
 *     visible in the UI and in the console instead of silent
 *   - interpolation that does not touch its arguments, accepting either
 *     an ordered array (what every existing call site passes) or a named
 *     bag (what new code should pass)
 *   - plurals through Intl.PluralRules, so a language with more than two
 *     forms is a catalogue change and not a code change
 *   - number, currency and date formatting bound to the active locale
 *
 * The React binding lives in ./useLang so this file stays framework-free
 * and can be imported from plain modules like utils and constants.
 */

import en from './locales/en';

const DEFAULT_LOCALE = 'en';
const STORAGE_KEY = 'vendor.locale';

/** code -> catalogue */
const catalogs = {};

let activeCode = DEFAULT_LOCALE;

const listeners = [];
const warned = {};

/**
 * Matches both placeholder styles in one pass:
 *
 *   %s        positional, what the existing call sites use
 *   {name}    named, what new strings use
 *
 * Both are filled from an array in the order they appear, so a catalogue
 * can be rewritten from %s to {name} - as the English one has been -
 * without touching a single call site.
 */
const TOKEN = /%s|\{(\w+)\}/g;

const isObject = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

/**
 * Add a language. The catalogue carries its own code, so registering is
 * `registerLocale(require('./locales/ko').default)` and nothing else.
 */
export const registerLocale = (catalog) => {
  if (!catalog || !catalog.code) {
    throw new Error('registerLocale: a catalogue needs a `code`');
  }
  catalogs[catalog.code] = catalog;
  return catalog.code;
};

registerLocale(en);

export const getLocale = () => activeCode;

export const getLocales = () =>
  Object.keys(catalogs).map((code) => ({
    code,
    name: catalogs[code].name || code,
  }));

export const hasLocale = (code) => !!code && !!catalogs[code];

/** The BCP-47 tag Intl should use - not always the same as the code. */
export const getIntlTag = () => {
  const catalog = catalogs[activeCode];
  return (catalog && catalog.intlTag) || activeCode;
};

export const subscribeLocale = (listener) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
};

const notify = () => {
  // Copied first: a listener that unsubscribes itself while we are
  // iterating would otherwise shift the array under the loop.
  listeners.slice().forEach((listener) => listener(activeCode));
};

export const setLocale = (code) => {
  if (!hasLocale(code)) {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] no catalogue registered for "${code}"`);
    return activeCode;
  }
  if (code === activeCode) return activeCode;

  activeCode = code;

  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch (e) {
    // Private browsing, or storage disabled. The choice just will not
    // survive a reload, which is not worth failing a render over.
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    // Screen readers and the browser's own translation prompt read this,
    // and CSS can hang language-specific rules off it.
    document.documentElement.lang = code;
  }

  notify();
  return activeCode;
};

/**
 * Pick the starting language: an explicit earlier choice first, then what
 * the browser asks for, then English. Call once at boot.
 */
export const initLocale = () => {
  let stored = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    stored = null;
  }

  if (hasLocale(stored)) return setLocale(stored);

  const preferred = (typeof navigator !== 'undefined'
    && (navigator.languages || [navigator.language])) || [];

  for (let i = 0; i < preferred.length; i += 1) {
    const tag = String(preferred[i] || '');
    // "en-GB" should match the "en" catalogue.
    const base = tag.split('-')[0];
    if (hasLocale(tag)) return setLocale(tag);
    if (hasLocale(base)) return setLocale(base);
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = activeCode;
  }
  return activeCode;
};

/* ------------------------------------------------------------------ *
 * Lookup
 * ------------------------------------------------------------------ */

const chain = () => (
  activeCode === DEFAULT_LOCALE ? [activeCode] : [activeCode, DEFAULT_LOCALE]
);

/**
 * hasOwnProperty rather than a truthiness test: TEXT_UNIT_COUNT is
 * deliberately "", and a truthiness test would treat that as absent and
 * fall through to the next locale, or to the key.
 */
const lookup = (section, key) => {
  const codes = chain();
  for (let i = 0; i < codes.length; i += 1) {
    const catalog = catalogs[codes[i]];
    const bag = catalog && catalog[section];
    if (bag && Object.prototype.hasOwnProperty.call(bag, key)) return bag[key];
  }
  return undefined;
};

const warnOnce = (message) => {
  if (warned[message]) return;
  warned[message] = true;
  // eslint-disable-next-line no-console
  console.warn(`[i18n] ${message}`);
};

/**
 * Fill placeholders without touching `replacements`.
 *
 * An array fills tokens left to right. A named bag fills {name} tokens by
 * name and leaves anything it has no value for as the literal token, so a
 * half-filled string is obvious rather than quietly truncated.
 */
const interpolate = (template, replacements) => {
  if (replacements === null || replacements === undefined) return template;
  if (typeof template !== 'string') return template;
  if (template.indexOf('%s') < 0 && template.indexOf('{') < 0) return template;

  if (Array.isArray(replacements)) {
    let index = 0;
    return template.replace(TOKEN, () => {
      const value = replacements[index];
      index += 1;
      return value === null || value === undefined ? '' : String(value);
    });
  }

  if (!isObject(replacements)) return template;

  return template.replace(TOKEN, (match, name) => {
    if (!name) return match;                     // a %s has no name to look up
    const value = replacements[name];
    return value === null || value === undefined ? match : String(value);
  });
};

/**
 * The main entry point, unchanged in signature.
 *
 *   getLangText('TEXT_SAVE')
 *   getLangText('TEXT_TOTAL_ROWS', [42])
 *   getLangText('PAGINATION_SHOWING', { from: 1, to: 10, total: 42 })
 */
export const getLangText = (key, replacements) => {
  if (!key) return '';

  const template = lookup('messages', key);

  if (template === undefined) {
    warnOnce(`missing message "${key}" in "${activeCode}"`);
    // The key, not "": a visible TEXT_SAVE beats a button with no label,
    // and it says exactly which key to add.
    return key;
  }

  return interpolate(template, replacements);
};

/** Short alias, for new code that reads better with it. */
export const t = getLangText;

/**
 * Plural-aware lookup. Given COUNT_ROW and 1 it reads COUNT_ROW_ONE;
 * given 5, COUNT_ROW_OTHER. `count` is available to the template as
 * {count} without being passed twice.
 */
export const getLangPlural = (key, count, replacements) => {
  let category = count === 1 ? 'one' : 'other';

  if (typeof Intl !== 'undefined' && Intl.PluralRules) {
    try {
      category = new Intl.PluralRules(getIntlTag()).select(count);
    } catch (e) {
      // Locale data missing for this tag - the one/other guess stands.
    }
  }

  const values = Object.assign({ count }, isObject(replacements) ? replacements : null);
  const exact = lookup('messages', `${key}_${category.toUpperCase()}`);
  if (exact !== undefined) return interpolate(exact, values);

  const other = lookup('messages', `${key}_OTHER`);
  if (other !== undefined) return interpolate(other, values);

  return getLangText(key, values);
};

/**
 * Label for a domain code the API returns as an integer.
 *
 *   getEnumText('APPSTORE_LICENSE_STATE', 'REFUND')  -> "Refund"
 *
 * Reading these through a function rather than importing the object is
 * what lets constants.js stay locale-aware: see the getters there.
 */
export const getEnumText = (group, key) => {
  if (!group || !key) return '';

  const bag = lookup('enums', group);
  if (!bag) {
    warnOnce(`missing enum group "${group}" in "${activeCode}"`);
    return key;
  }
  if (!Object.prototype.hasOwnProperty.call(bag, key)) {
    warnOnce(`missing enum "${group}.${key}" in "${activeCode}"`);
    return key;
  }
  return bag[key];
};

/** Status text for a transport code. */
export const getRespText = (key) => {
  const text = lookup('responses', key);
  if (text === undefined) {
    warnOnce(`missing response "${key}" in "${activeCode}"`);
    return key;
  }
  return text;
};

/* ------------------------------------------------------------------ *
 * Formatting
 *
 * Locale-correct grouping and date order are half of what makes a UI
 * feel translated, and they are the half hand-written formatters always
 * get wrong. All three fall back to the plain value rather than throwing,
 * because a table cell is not the place to discover that a row carried a
 * null where a number was expected.
 * ------------------------------------------------------------------ */

export const formatNumber = (value, options) => {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (isNaN(number)) return String(value);

  try {
    return new Intl.NumberFormat(getIntlTag(), options).format(number);
  } catch (e) {
    return String(value);
  }
};

export const formatCurrency = (value, currency, options) =>
  formatNumber(value, Object.assign(
    { style: 'currency', currency: currency || 'USD' },
    options
  ));

export const formatDate = (value, options) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value);

  try {
    return new Intl.DateTimeFormat(getIntlTag(), options || {
      year: 'numeric', month: 'short', day: '2-digit',
    }).format(date);
  } catch (e) {
    return String(value);
  }
};
