/**
 * The console's formatting, in one place.
 *
 * Every one of these takes whatever the API actually sends - PostgreSQL hands
 * NUMERIC back as a string, dates as 'YYYY-MM-DD', timestamps as ISO text -
 * and none of them throws on null.  A table cell that renders "NaN" or
 * "Invalid Date" is a bug report; a blank one is a missing value.
 */

/**
 * A SPACE GROUPS THOUSANDS, IN EVERY LANGUAGE.
 *
 * This used to be `toLocaleString`, which is the correct-sounding answer and
 * the wrong one for this console: it hands a comma to an English reader, a
 * full stop to a German one and a narrow no-break space to a Russian one, so
 * the same invoice read three ways and "1.234" meant either a thousand or
 * one-and-a-bit depending on who was looking. One separator everywhere is
 * the only version nobody has to guess at, and the space is the separator
 * that no locale reads as a decimal point.
 *
 * It is a PLAIN space rather than U+00A0. The no-break space is the
 * typographically right character and it survives neither a copy into Excel
 * (which then refuses to parse the number) nor a grep by somebody looking for
 * "1 234" in a bug report. Tables in this console set `white-space: nowrap`
 * on their cells anyway, so the number does not break across lines regardless.
 */
const GROUP = ' ';

/**
 * AT MOST THREE DIGITS AFTER THE POINT, AND NO TRAILING ZEROS.
 *
 * 89.90 reads as 89.9, 89.00 as 89, and 1234.5678 as 1 234.568.
 *
 * DELIBERATE, INCLUDING FOR MONEY, which used to be pinned at exactly two
 * decimals. The trade is real and worth stating: a money column no longer
 * decimal-aligns, because "89" and "89.95" are different widths, and a price
 * of 89 no longer *looks* like a price. What it buys is that a value the
 * database holds to three places is shown to three places instead of being
 * silently rounded on screen - which is what made a converted price appear to
 * disagree with the storefront - and that a column of whole-currency amounts
 * stops being a column of ".00".
 */
const MAX_DECIMALS = 3;

/**
 * The shared body of every number on screen: null for anything that is not a
 * finite number, so each caller can decide what a missing value looks like.
 */
function grouped(value, digits) {
  const n = Number(value);
  if (!isFinite(n)) return null;

  const places = Math.min(digits === undefined ? MAX_DECIMALS : digits, MAX_DECIMALS);

  /*
   * toFixed switches to exponential notation above 1e21, and "1e+21" with a
   * space shoved into it is worse than the raw number. Nothing in this
   * console reaches that, but a corrupt row should not render as nonsense.
   */
  if (Math.abs(n) >= 1e21) return String(n);

  const fixed = Math.abs(n).toFixed(places);
  const point = fixed.indexOf('.');
  const whole = point === -1 ? fixed : fixed.slice(0, point);
  const fraction = point === -1 ? '' : fixed.slice(point + 1).replace(/0+$/, '');

  /*
   * The sign is taken from the ROUNDED value, not the raw one: -0.0004 shown
   * to three places is zero, and "-0" is not a number anybody writes.
   */
  const sign = n < 0 && Number(fixed) !== 0 ? '-' : '';

  return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP) + (fraction ? '.' + fraction : '');
}

export function money(value, currency) {
  if (value === null || value === undefined || value === '') return '-';
  const text = grouped(value);
  if (text === null) return '-';
  return currency ? text + ' ' + currency : text;
}

/**
 * `digits` is a CEILING, not a width: asking for two still renders 3 rather
 * than 3.00. It is capped at three, so no caller can reintroduce the long
 * tail this file exists to cut off.
 */
export function number(value, digits) {
  if (value === null || value === undefined || value === '') return '-';
  const text = grouped(value, digits);
  return text === null ? '-' : text;
}

/** A ratio stored as 0..1, shown as a percentage. */
export function percent(value, digits) {
  if (value === null || value === undefined || value === '') return '-';
  const text = grouped(Number(value) * 100, digits === undefined ? 0 : digits);
  return text === null ? '-' : text + '%';
}

/** A percentage the API already expressed as a percentage, with its sign. */
export function trend(value) {
  if (value === null || value === undefined || value === '') return '-';
  const text = grouped(value, 1);
  return text === null ? '-' : (Number(value) > 0 ? '+' : '') + text + '%';
}

/**
 * DATES AND TIMES ARE WRITTEN ONE WAY, HERE.
 *
 *   date        2026.09.14
 *   dateMinute  2026.09.14 15:04
 *   dateTime    2026.09.14 15:04:09
 *
 * Dots, four-digit year first, zero padded, and NOT locale-dependent. A
 * console read by three languages that formats through `toLocaleDateString`
 * shows 14/09/2026 to one reader and 9/14/2026 to another, which is the one
 * format where a reader cannot tell which number is the month. The unit is
 * chosen by what is being read rather than by which screen it is on: a day
 * for a day, a minute for a conversation, a second for an audit trail.
 *
 * A STRING IS NOT PARSED INTO A DATE WHERE IT DOES NOT HAVE TO BE. A date
 * column arrives as 'YYYY-MM-DD' and means that calendar day everywhere;
 * pushing it through `new Date` re-reads it as UTC midnight and hands a
 * reader west of Greenwich the day before.
 */

const pad2 = (n) => (n < 10 ? '0' + n : String(n));

/** 'YYYY-MM-DD' (or an ISO timestamp) -> '2026.09.14', by text. */
export function date(value) {
  if (!value) return '-';

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) return match[1] + '.' + match[2] + '.' + match[3];

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return String(value);

  return parsed.getFullYear() + '.' + pad2(parsed.getMonth() + 1) + '.' + pad2(parsed.getDate());
}

/** The shared body of the two timestamp shapes. */
function stamp(value, withSeconds) {
  if (!value) return '-';

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return String(value);

  const day = parsed.getFullYear() + '.' + pad2(parsed.getMonth() + 1) + '.' + pad2(parsed.getDate());
  const time = pad2(parsed.getHours()) + ':' + pad2(parsed.getMinutes());

  return day + ' ' + time + (withSeconds ? ':' + pad2(parsed.getSeconds()) : '');
}

/** A timestamp to the second - '2026.09.14 15:04:09'. */
export function dateTime(value) {
  return stamp(value, true);
}

/**
 * A timestamp to the minute - '2026.09.14 15:04'.
 *
 * For a conversation, where several messages land in a day and the DAY alone
 * cannot order them, but the second is more precision than a reader wants.
 */
export function dateMinute(value) {
  return stamp(value, false);
}

/**
 * How long ago, in the roughest useful unit.
 *
 * "3 days" is what somebody triaging a queue needs; the exact timestamp is on
 * the detail page for when it matters.
 */
export function since(value) {
  if (!value) return '-';
  const then = new Date(value).getTime();
  if (isNaN(then)) return '-';

  const hours = (Date.now() - then) / 3600000;
  if (hours < 1) return Math.max(1, Math.round(hours * 60)) + 'm';
  if (hours < 48) return Math.round(hours) + 'h';
  return Math.round(hours / 24) + 'd';
}

/** The word for a numeric code, from a map the API sent. */
export function labelOf(map, value) {
  if (value === null || value === undefined) return '-';
  return (map && map[value]) || String(value);
}

const format = { money, number, percent, trend, date, dateTime, dateMinute, since, labelOf };

export default format;
