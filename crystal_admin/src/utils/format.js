/**
 * The console's formatting, in one place.
 *
 * Every one of these takes whatever the API actually sends - PostgreSQL hands
 * NUMERIC back as a string, dates as 'YYYY-MM-DD', timestamps as ISO text -
 * and none of them throws on null.  A table cell that renders "NaN" or
 * "Invalid Date" is a bug report; a blank one is a missing value.
 */

export function money(value, currency) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!isFinite(n)) return '-';

  const text = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return currency ? text + ' ' + currency : text;
}

export function number(value, digits) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!isFinite(n)) return '-';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits || 0,
    maximumFractionDigits: digits === undefined ? 0 : digits
  });
}

/** A ratio stored as 0..1, shown as a percentage. */
export function percent(value, digits) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!isFinite(n)) return '-';
  return (n * 100).toFixed(digits === undefined ? 0 : digits) + '%';
}

/** A percentage the API already expressed as a percentage, with its sign. */
export function trend(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!isFinite(n)) return '-';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
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
