/*
 * THE BIRTHDAY SEARCH BOX SHOWS WHAT IT SEARCHES, IN THE CONSOLE'S DATE FORM.
 *
 * Whatever the reader types, the box rewrites it to 2026.09.14 (or the year,
 * or the month and day) - the same reading the server makes of it.
 */
import { birthdayText } from '../utils/birthday';

describe('a birthday is rewritten to the standard form', () => {
  test('a whole date, however it is written', () => {
    ['1985.03.12', '1985-3-12', '1985/03/12', '19850312', '12.03.1985', '12/3/1985',
      '1985年3月12日', '1985년 3월 12일', '1985 3 12'].forEach((typed) => {
      expect(birthdayText(typed)).toBe('1985.03.12');
    });
  });

  test('a date written month first is read so when the day cannot be the month', () => {
    expect(birthdayText('05/23/1985')).toBe('1985.05.23');
  });

  test('a year alone', () => {
    expect(birthdayText('1985')).toBe('1985');
  });

  test('a day without a year', () => {
    expect(birthdayText('3-12')).toBe('03.12');
    expect(birthdayText('3월 12일')).toBe('03.12');
    expect(birthdayText('23.05')).toBe('05.23');
  });

  test('nothing that is not a real birthday', () => {
    ['', 'abc', '01012345678', '1850', '1985.02.30', '2/30', '13.13'].forEach((typed) => {
      expect(birthdayText(typed)).toBeNull();
    });
  });
});
