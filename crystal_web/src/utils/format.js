/**
 * DATES AND TIMES ARE WRITTEN ONE WAY, HERE.
 *
 *   date        2026.09.14
 *   dateMinute  2026.09.14 15:04
 *   dateTime    2026.09.14 15:04:09
 *
 * There was no such file, and it showed: the storefront formatted dates nine
 * different ways in nine different components - `toLocaleDateString()` in six
 * of them, `String(value).slice(0, 10)` in the rest. Those are not the same
 * format and they are not even stable between readers, because
 * `toLocaleDateString` follows the BROWSER's locale rather than the one the
 * visitor picked in the header: a member who has chosen 简体中文 still gets
 * 14/09/2026 from a British browser and 9/14/2026 from an American one, and
 * those two disagree about which number is the month.
 *
 * So: dots, four-digit year first, zero padded, the same for every reader in
 * every language. A date is a timestamp, not prose - it does not get
 * translated, it gets read.
 *
 * THE UNIT IS CHOSEN BY WHAT IS BEING READ. A day for a day; a minute for a
 * conversation, where several messages can land between breakfast and lunch
 * and the day alone cannot put them in order; a second for an audit trail.
 *
 * A DATE STRING IS NOT PARSED INTO A Date WHERE IT DOES NOT HAVE TO BE.
 * 'YYYY-MM-DD' means that calendar day everywhere, but `new Date('2026-09-14')`
 * reads it as UTC midnight - so a reader west of Greenwich is shown the 13th.
 * The text path below is not an optimisation, it is the correct answer.
 */

const pad2 = (n) => (n < 10 ? '0' + n : String(n));

/** Nothing to show. An em dash, not "Invalid Date" and not a blank cell. */
const EMPTY = '—';

/** 'YYYY-MM-DD' or an ISO timestamp -> '2026.09.14'. */
export function date(value) {
  if (!value) return EMPTY;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) return match[1] + '.' + match[2] + '.' + match[3];

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return EMPTY;

  return parsed.getFullYear() + '.' + pad2(parsed.getMonth() + 1) + '.' + pad2(parsed.getDate());
}

/** The shared body of the two timestamp shapes. */
function stamp(value, withSeconds) {
  if (!value) return EMPTY;

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return EMPTY;

  const day = parsed.getFullYear() + '.' + pad2(parsed.getMonth() + 1) + '.' + pad2(parsed.getDate());
  const time = pad2(parsed.getHours()) + ':' + pad2(parsed.getMinutes());

  return day + ' ' + time + (withSeconds ? ':' + pad2(parsed.getSeconds()) : '');
}

/** A timestamp to the second - '2026.09.14 15:04:09'. */
export function dateTime(value) {
  return stamp(value, true);
}

/** A timestamp to the minute - '2026.09.14 15:04'. */
export function dateMinute(value) {
  return stamp(value, false);
}

const format = { date, dateTime, dateMinute };

export default format;
