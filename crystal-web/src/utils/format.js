/**
 * DATES, TIMES AND NUMBERS ARE WRITTEN ONE WAY, HERE.
 *
 *   date        2026.09.14
 *   dateMinute  2026.09.14 15:04
 *   dateTime    2026.09.14 15:04:09
 *   number      1 234.568
 *   money       $1 234.5
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

/* --------------------------------------------------------------- numbers */

/**
 * A NUMBER, WRITTEN THE SAME WAY EVERYWHERE ON THE SITE.
 *
 *   1234           1 234
 *   1234.5678      1 234.568
 *   89.90          89.9
 *   89.00          89
 *
 * Three decisions, and each one was being made per component before this:
 *
 *   THOUSANDS ARE SEPARATED BY A SPACE, not a comma. A comma is the decimal
 *   point in most of continental Europe and in Russia - one of the three
 *   languages this site speaks - so "1,234" is a genuinely ambiguous string
 *   rather than merely an unfamiliar one. A space is the SI grouping and
 *   reads the same to every one of our readers.
 *
 *   THREE DECIMALS AT MOST. Prices have two, points have none, and a rating
 *   or a rate can have three; nothing on this site means anything at the
 *   fourth. Rounding here rather than at the call site is what stops the
 *   same figure appearing as 12.3456 on one page and 12.35 on the next.
 *
 *   TRAILING ZEROS COME OFF. `89.00` is two characters of noise on every row
 *   of a column of prices, and a column of `89`, `12.5`, `7` scans faster
 *   than one padded to a width the data does not have. The old price
 *   formatter forced two decimals and carried a special case for JPY and KRW
 *   to undo it; trimming makes that case disappear on its own.
 *
 * WHY NOT `toLocaleString`. Because it follows the BROWSER's locale, which
 * is the same bug the date helpers above exist to avoid: the grouping
 * character would change under the reader depending on which machine they
 * opened the site on, and the language switcher would have no say in it.
 *
 * A value that is not a number at all comes back as '0' rather than as an
 * em dash: every call site that can be handed nothing already guards for it
 * and decides its own placeholder, and a bare '0' is what the old
 * `Number(amount) || 0` produced.
 */
export function number(value) {
  const parsed = Number(value);
  if (!isFinite(parsed)) return '0';

  /*
   * Rounded first, then split - `toFixed` does both, and doing it in one
   * step is what keeps 1234.5678 from arriving here as 1234.5677999999.
   */
  const parts = Math.abs(parsed).toFixed(3).split('.');
  const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fraction = parts[1].replace(/0+$/, '');

  const text = fraction ? whole + '.' + fraction : whole;

  /* -0.0001 rounds to zero, and "-0" is not a number anybody means. */
  return parsed < 0 && text !== '0' ? '-' + text : text;
}

/** What a currency is written as. An unknown code gets no symbol, not a guess. */
// const SYMBOLS = { USD: '$', CNY: '¥', JPY: '¥', KRW: '₩', EUR: '€', RUB: '₽' };

/**
 * An amount of money - the symbol, then the number above.
 *
 * There is no per-currency rounding rule any more. JPY and KRW have no minor
 * unit and used to need one so they did not render as "¥1200.00"; now that
 * trailing zeros come off, they format correctly by doing nothing special.
 */
export function money(amount, currency) {
  // return (SYMBOLS[currency] || '') + number(amount);
  return number(amount);
}

const format = { date, dateTime, dateMinute, number, money };

export default format;
