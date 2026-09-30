/*
 * A NUMBER IS WRITTEN ONE WAY, AND ONLY ONE PLACE DECIDES WHAT IT IS.
 *
 * The same argument as dateFormat.test.js, for the other half of what a
 * storefront prints. Three things were being decided per component and all
 * three were being decided differently:
 *
 *   THE THOUSANDS SEPARATOR. `toLocaleString()` follows the BROWSER, so the
 *   same balance read 1,234 on an English machine and 1 234 on a Russian one
 *   - and the site's own language switcher had no say in either. Worse than
 *   inconsistent: a comma is the DECIMAL POINT in Russian, which is one of
 *   the three languages this site speaks, so "1,234" is genuinely ambiguous
 *   to a reader we actually have.
 *
 *   HOW MANY DECIMALS. Prices were forced to two, ratings to one, everything
 *   else to whatever the float happened to be - so 12.3456 appeared in full
 *   on one page and as 12.35 on the next.
 *
 *   TRAILING ZEROS. `89.00` and `1200.00` were printed in full, which is two
 *   characters of noise on every row of a column of prices.
 *
 * None of that is visible in a diff that adds one more `.toLocaleString()` to
 * one more page, which is why this is a test and not a convention.
 */
import { money, number } from '../utils/format';
import { formatPrice } from '../theme/tokens';

test('thousands are separated by a space, not a comma', () => {
  expect(number(1234)).toBe('1 234');
  expect(number(1234567)).toBe('1 234 567');

  /* Four digits group too - 1 234, not 1234. */
  expect(number(1000)).toBe('1 000');

  /* Three and fewer do not. */
  expect(number(999)).toBe('999');
  expect(number(0)).toBe('0');
});

test('at most three decimals, and trailing zeros come off', () => {
  /* The three the request named, by name. */
  expect(number(89.9)).toBe('89.9');
  expect(number(89.0)).toBe('89');
  expect(number(1234.5678)).toBe('1 234.568');

  /* A whole number never grows a point. */
  expect(number(42)).toBe('42');

  /* Two decimals stay two; three stay three. */
  expect(number(12.25)).toBe('12.25');
  expect(number(0.125)).toBe('0.125');

  /* The fourth is rounded away, not truncated. */
  expect(number(0.9999)).toBe('1');
});

test('a negative keeps its sign, and a rounded-away one does not', () => {
  expect(number(-1234.5)).toBe('-1 234.5');

  /*
   * -0.0001 rounds to zero, and "-0" is not a number anybody means. This is
   * the edge that `Math.abs` plus a sign test walks straight into.
   */
  expect(number(-0.0001)).toBe('0');
});

test('nothing in gives a zero, not NaN and not an em dash', () => {
  /*
   * Every call site that can be handed nothing already guards and picks its
   * own placeholder; what must never reach a reader is the word NaN. '0' is
   * also exactly what the old `Number(amount) || 0` produced, so no screen
   * changed behaviour when the rules moved here.
   */
  [null, undefined, '', 'not a number', NaN, Infinity].forEach((empty) => {
    expect(number(empty)).toBe('0');
  });

  /* A numeric STRING is a number - the API sends decimals as strings. */
  expect(number('1234.50')).toBe('1 234.5');
});

test('money is the symbol and then that same number', () => {
  expect(money(1234.5, 'USD')).toBe('$1 234.5');
  expect(money(1234, 'CNY')).toBe('¥1 234');
  expect(money(99.9, 'EUR')).toBe('€99.9');

  /* An unknown code gets no symbol rather than a guessed one. */
  expect(money(10, 'XXX')).toBe('10');
  expect(money(10)).toBe('10');
});

test('the currencies with no minor unit need no special case any more', () => {
  /*
   * JPY and KRW used to be listed by hand so they did not render as
   * "¥1200.00". Trimming trailing zeros does that on its own - which is the
   * test that the special case is genuinely gone rather than merely moved.
   */
  expect(money(1200, 'JPY')).toBe('¥1 200');
  expect(money(1200, 'KRW')).toBe('₩1 200');

  /* And a yen amount that really does have a fraction still shows it. */
  expect(money(1200.5, 'JPY')).toBe('¥1 200.5');
});

test('there is exactly one implementation, and formatPrice is it', () => {
  /*
   * `formatPrice` is imported from theme/tokens by eleven screens and had its
   * own rounding rules. It now delegates, which is what keeps a price and a
   * point balance on the same row of the same table grouped the same way.
   */
  expect(formatPrice(1234.5, 'USD')).toBe(money(1234.5, 'USD'));
  expect(formatPrice(89.0, 'USD')).toBe('$89');
  expect(formatPrice(1234567.8912, 'USD')).toBe('$1 234 567.891');
});
