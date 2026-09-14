const config = require('../config');

const catalogs = {
  en: require('./en'),
  zh: require('./zh'),
  ru: require('./ru')
};

/**
 * THE KEY IS THE ENGLISH TEXT, exactly as it is written at the throw site.
 *
 * A catalog is therefore a map from that English text to some wording, and a
 * message nobody has an entry for falls through in English rather than turning
 * into a key the reader has to decipher.  That is what makes it safe to pass
 * anything through `translate` - including text that came from PostgreSQL
 * rather than from this codebase.
 *
 * ENGLISH USED TO HAVE NO CATALOG, on the grounds that the source language
 * needs no translation of itself.  The cost of that was a reply could only be
 * reworded by editing the throw site somewhere in services/ - which moved the
 * key and silently orphaned its Chinese.  English is a catalog like any other
 * now; the lookup below did not change, because falling through to the key is
 * still exactly right for a message with no entry.
 */
/**
 * The language the KEYS are written in, which is also what an unrecognised
 * Accept-Language falls back to.  They are the same word for two different
 * facts, and both are still true, so both are still named.
 */
const SOURCE_LOCALE = 'en';

/**
 * What a caller with no preference is answered in - DEFAULT_LOCALE in .env.
 *
 * SEPARATE FROM SOURCE_LOCALE, which is fixed. The source locale is the
 * language the catalog keys fall back to and the language this codebase is
 * written in; changing it would be a rewrite, not a setting. This one is a
 * deployment's choice, so a Chinese installation answers a webhook or a curl
 * in Chinese rather than in English.
 *
 * It does NOT override anybody's choice: X-Lang and Accept-Language are both
 * consulted first, and a browser sends at least one of them. An unknown value
 * here would silently disable the setting, so it falls back to the source.
 */
const DEFAULT_LOCALE = catalogs[config.defaultLocale] ? config.defaultLocale : SOURCE_LOCALE;

/** Header the frontends send; they know the user's choice, the browser does not. */
const LOCALE_HEADER = 'x-lang';

/** 'zh-CN' and 'ZH' both mean the zh catalog; anything unknown means none. */
function normalise(tag) {
  const base = String(tag || '').trim().toLowerCase().split(/[-_;]/)[0];
  return catalogs[base] ? base : null;
}

/**
 * The locale for one request: the app's own header first, then whatever the
 * browser asks for, then the default.
 *
 * Accept-Language is a weighted list; the quality values only ever reorder it,
 * and the first tag there is actually a catalog for is the best available
 * answer either way, so they are not worth parsing.
 */
function localeOf(req) {
  const explicit = normalise(req.headers[LOCALE_HEADER]);
  if (explicit) return explicit;

  const accepted = String(req.headers['accept-language'] || '').split(',');
  for (let i = 0; i < accepted.length; i += 1) {
    const match = normalise(accepted[i]);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** Fills {name} placeholders from `params`; an unknown name is left alone. */
function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole;
  });
}

/**
 * The message to send back.  A message with no entry in the catalog is
 * returned as written, which is what makes it safe to pass anything through
 * here - including text that came from PostgreSQL rather than from this
 * codebase, which will never have an entry and must not be mangled.
 */
function translate(locale, text, params) {
  if (text === undefined || text === null) return text;

  const key = String(text);

  /*
   * AN ADDRESS IS DOTTED AND HAS NO SPACES - `memberAuth.thatCodeHasExpired`.
   *
   * That test is what lets anything be passed through here safely. A message
   * that came from PostgreSQL rather than from this codebase is a sentence,
   * never an address, so it is returned as written instead of being looked up
   * and mangled.
   */
  if (key.indexOf('.') === -1 || key.indexOf(' ') !== -1) {
    return interpolate(key, params);
  }

  /*
   * The locale first, then ENGLISH, then the address itself.
   *
   * Falling back to English matters more here than in a browser: an address
   * that reached a reply unresolved would be shown to a user AS the address,
   * a token where a sentence belongs. With the English behind it, a gap in a
   * translation is a reply in the wrong language rather than a broken one -
   * and scripts/check.js still reports the gap, because "it works" and "it is
   * translated" are different claims.
   */
  const translated = walk(catalogs[locale], key);
  if (translated !== undefined) return interpolate(translated, params);

  const english = walk(catalogs[SOURCE_LOCALE], key);
  return interpolate(english === undefined ? key : english, params);
}

/** One step per dotted segment; undefined the moment a segment is missing. */
function walk(catalog, key) {
  const parts = key.split('.');
  let at = catalog;

  for (let i = 0; i < parts.length; i += 1) {
    if (!at || typeof at !== 'object') return undefined;
    at = at[parts[i]];
  }

  return typeof at === 'string' ? at : undefined;
}

/** Resolves the locale once per request, so no reply re-reads headers. */
function language(req, res, next) {
  req.locale = localeOf(req);
  next();
}

module.exports = {
  SOURCE_LOCALE: SOURCE_LOCALE,
  DEFAULT_LOCALE: DEFAULT_LOCALE,
  LOCALE_HEADER: LOCALE_HEADER,
  language: language,
  localeOf: localeOf,
  translate: translate,
  /*
   * The catalogs ARE the languages now that English is one of them - it used
   * to be prepended, because it had no catalog to be counted from.
   */
  catalogs: catalogs,
  locales: function () { return Object.keys(catalogs); }
};
