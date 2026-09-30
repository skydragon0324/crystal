/*
 * HOW A NUMBER IS WRITTEN, ASSERTED.
 *
 * Two rules changed at once here and both of them are the kind that look
 * fine in a screenshot and are wrong in a spreadsheet:
 *
 *   THOUSANDS GROUP WITH A SPACE, in every language. This used to be
 *   `toLocaleString`, which hands a comma to an English reader and a full
 *   stop to a German one - so "1.234" meant either a thousand or one and a
 *   bit depending on who was looking at the same invoice.
 *
 *   THREE DECIMALS AT MOST, AND NO TRAILING ZEROS. Money included, which is
 *   the deliberate part: a currency column that used to be pinned at two
 *   decimals now reads 89 where it read 89.00.
 *
 * Neither rule is something the type system or the build can hold, and every
 * one of these cases came out of the instruction rather than out of the
 * implementation - which is why they are written as the words, not as
 * whatever the code happens to return.
 */
import { money, number, percent, trend } from '../utils/format';

describe('thousands are grouped with a space', () => {
  test('at every size', () => {
    expect(number(999)).toBe('999');
    expect(number(1000)).toBe('1 000');
    expect(number(1234567)).toBe('1 234 567');
    expect(money(1234.5678)).toBe('1 234.568');
  });

  test('and never with a comma or a full stop', () => {
    ['1,234', '1.234.567'].forEach((wrong) => {
      expect(number(1234567)).not.toContain(wrong);
    });
    expect(number(1234567).indexOf(',')).toBe(-1);
  });

  test('on the wrong side of zero too', () => {
    expect(number(-1234567)).toBe('-1 234 567');
    expect(money(-89.5)).toBe('-89.5');
  });
});

describe('at most three decimals, with the trailing zeros gone', () => {
  test('the cases from the brief', () => {
    expect(money(89.9)).toBe('89.9');
    expect(money(89.0)).toBe('89');
    expect(number(0.4)).toBe('0.4');
    expect(number(1234.5678)).toBe('1 234.568');
  });

  test('a fourth digit is rounded away rather than shown', () => {
    expect(number(0.12345)).toBe('0.123');
    expect(number(2.9999)).toBe('3');
  });

  test('`digits` is a ceiling, not a width', () => {
    /* number(x, 2) used to pad to two places; it caps at two now. */
    expect(number(3, 2)).toBe('3');
    expect(number(3.456, 2)).toBe('3.46');
    /* And nothing can ask for more than the three this file allows. */
    expect(number(1.23456, 6)).toBe('1.235');
  });

  test('a value that rounds to nothing is not negative zero', () => {
    expect(number(-0.0001)).toBe('0');
  });
});

describe('what a missing value looks like', () => {
  test('a dash, never NaN', () => {
    [null, undefined, '', 'not a number'].forEach((empty) => {
      expect(money(empty)).toBe('-');
      expect(number(empty)).toBe('-');
      expect(percent(empty)).toBe('-');
      expect(trend(empty)).toBe('-');
    });
  });

  test('zero is a value and is shown', () => {
    expect(money(0)).toBe('0');
    expect(number(0)).toBe('0');
  });

  test('a NUMERIC arrives as a string, because PostgreSQL sends it as one', () => {
    expect(money('1099.00')).toBe('1 099');
    expect(money('1099.50', 'USD')).toBe('1 099.5 USD');
  });
});

describe('the percentages', () => {
  test('a ratio becomes whole percent by default', () => {
    expect(percent(0.25)).toBe('25%');
    expect(percent(0.256, 1)).toBe('25.6%');
  });

  test('a trend keeps its sign and loses its trailing zero', () => {
    expect(trend(12)).toBe('+12%');
    /*
     * 12.38 rather than 12.35: a half that cannot be held exactly in binary
     * rounds by whatever the double actually is, and 12.35 is stored a shade
     * BELOW the half. That is toFixed's behaviour and always was - worth a
     * line here so the next person does not read it as a rounding bug.
     */
    expect(trend(12.38)).toBe('+12.4%');
    expect(trend(-4)).toBe('-4%');
    expect(trend(0)).toBe('0%');
  });
});
