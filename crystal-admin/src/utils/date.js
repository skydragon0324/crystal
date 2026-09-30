/**
 * Small date helpers for the custom date picker.
 *
 * Values are exchanged with the API as plain 'YYYY-MM-DD' strings, never as
 * Date objects, so a picked day never shifts across a timezone boundary.
 */

export const pad2 = (n) => (n < 10 ? '0' + n : String(n));

/** Date -> 'YYYY-MM-DD' using local calendar fields (no UTC conversion). */
export function toISODate(date) {
  if (!date) return '';
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/** 'YYYY-MM-DD' or an ISO timestamp -> local Date at midnight, or null. */
export function parseISODate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isNaN(date.getTime()) ? null : date;
}

export const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

export const addMonths = (date, count) =>
  new Date(date.getFullYear(), date.getMonth() + count, 1);

export const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

export const isSameDay = (a, b) =>
  !!a && !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * The 6x7 grid for a month, including the leading/trailing days that belong to
 * the neighbouring months so every week row is full.
 */
export function buildCalendarGrid(year, month, weekStartsOn) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - (weekStartsOn || 0) + 7) % 7;
  const cells = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - offset + i);
    cells.push({ date, inMonth: date.getMonth() === month });
  }

  return cells;
}

/**
 * A comma separated override from the dictionary, or null.
 *
 * Every name list below asks Intl first and takes the override only when one
 * has been written.  That way a locale nobody has customised still reads
 * correctly, and customising one is a single line in the dictionary rather
 * than a table that has to be kept complete.
 */
function overrideList(text, expected) {
  if (!text) return null;
  const parts = String(text).split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length === expected ? parts : null;
}

/**
 * Localised month names, e.g. ['January', ...] for the given Intl locale.
 * `override` is a comma separated list of twelve names, January first.
 */
export function monthNames(intlLocale, style, override) {
  const custom = overrideList(override, 12);
  if (custom) return custom;

  const formatter = new Intl.DateTimeFormat(intlLocale, { month: style || 'long' });
  const names = [];
  for (let m = 0; m < 12; m++) names.push(formatter.format(new Date(2021, m, 1)));
  return names;
}

/**
 * Localised weekday initials ordered from weekStartsOn.
 * `override` is a comma separated list of seven names, Sunday first - it is
 * rotated here, so whoever writes it does not have to think about which day
 * the week starts on in which locale.
 */
export function weekdayNames(intlLocale, weekStartsOn, style, override) {
  const custom = overrideList(override, 7);
  const names = [];

  const formatter = custom
    ? null
    : new Intl.DateTimeFormat(intlLocale, { weekday: style || 'short' });

  // 2021-08-01 was a Sunday, so index 0 lines up with getDay() === 0.
  for (let i = 0; i < 7; i++) {
    const day = (i + (weekStartsOn || 0)) % 7;
    names.push(custom ? custom[day] : formatter.format(new Date(2021, 7, 1 + day)));
  }
  return names;
}

/**
 * A date written to a pattern.
 *
 * Longest token first, so MMMM is not read as MMM followed by a stray M.
 * Anything outside the tokens is copied through, which is what lets a pattern
 * carry the separators and the characters a locale writes dates with.
 *
 *   YYYY 2026   YY 26
 *   MMMM March  MMM Mar   MM 03   M 3
 *   DD 09       D 9
 */
const PATTERN_TOKENS = /YYYY|YY|MMMM|MMM|MM|M|DD|D/g;

export function formatToPattern(date, pattern, months, shortMonths) {
  return String(pattern).replace(PATTERN_TOKENS, function (token) {
    switch (token) {
      case 'YYYY': return String(date.getFullYear());
      case 'YY':   return pad2(date.getFullYear() % 100);
      case 'MMMM': return (months || [])[date.getMonth()] || String(date.getMonth() + 1);
      case 'MMM':  return (shortMonths || months || [])[date.getMonth()] || String(date.getMonth() + 1);
      case 'MM':   return pad2(date.getMonth() + 1);
      case 'M':    return String(date.getMonth() + 1);
      case 'DD':   return pad2(date.getDate());
      case 'D':    return String(date.getDate());
      default:     return token;
    }
  });
}

/**
 * 'YYYY-MM-DD' -> the text shown in the closed field, for display only.
 *
 * With no pattern it stays exactly as it was, on Intl's medium date; with one
 * it is written out by hand, because Intl offers a fixed set of shapes and
 * none of them is "whatever this business puts on its paperwork".
 */
export function formatDisplayDate(value, intlLocale, pattern, months, shortMonths) {
  const date = parseISODate(value);
  if (!date) return '';

  if (pattern) {
    try {
      return formatToPattern(date, pattern, months, shortMonths);
    } catch (e) {
      return toISODate(date);
    }
  }

  try {
    return new Intl.DateTimeFormat(intlLocale, {
      year: 'numeric', month: 'short', day: 'numeric'
    }).format(date);
  } catch (e) {
    return toISODate(date);
  }
}

/** Clamp helper for min/max bounds given as 'YYYY-MM-DD'. */
export function isOutOfRange(date, min, max) {
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);
  if (minDate && date < minDate) return true;
  if (maxDate && date > maxDate) return true;
  return false;
}
