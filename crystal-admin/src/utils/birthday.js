/**
 * A BIRTHDAY TYPED INTO THE SEARCH BOX, REWRITTEN THE WAY THE CONSOLE SHOWS DATES.
 *
 * The same reading as the server's searchBirthday (services/crm/birthday.js),
 * so the box can show what will actually be searched:
 *
 *   a whole date   1990-5-3, 1990/05/03, 19900503, 03.05.1990, 1990年5月3日   ->  1990.05.03
 *   a year alone   1990                                                       ->  1990
 *   a day alone    5-3, 05/03, 5月3日, 23.05                                    ->  05.03, 05.23
 *
 * A whole date written day first is read as day.month unless the second part
 * cannot be a month (05/23/1990). A day without a year whose parts could both
 * be the month stays as typed (zero padded): the server searches both readings.
 * Anything that is not a real date is null.
 */
const pad2 = (n) => (n < 10 ? '0' + n : String(n));

/** 1990年5月3日, 1990년 5월 3일, "1990 5 3" -> 1990.5.3: every way of writing the parts apart, as a dot. */
function separated(value) {
  return String(value == null ? '' : value).trim()
    .replace(/[日일]$/, '')
    .replace(/\s*[年月년월,\s]\s*/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

/** A day that exists in some year: 2000 was a leap year, so the 29th of February counts. */
function isDay(month, day) {
  const date = new Date(Date.UTC(2000, month - 1, day));
  return month >= 1 && month <= 12 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The typed birthday as 'YYYY.MM.DD', 'YYYY' or 'MM.DD', or null when it is not one. */
export function birthdayText(value) {
  const text = separated(value);
  let year, month, day, match;

  if ((match = /^(\d{4})$/.exec(text))) {
    const only = Number(match[1]);
    return only >= 1900 && only <= new Date().getFullYear() ? match[1] : null;
  }

  if ((match = /^(\d{1,2})[-/.](\d{1,2})$/.exec(text))) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (isDay(first, second)) return pad2(first) + '.' + pad2(second);
    if (isDay(second, first)) return pad2(second) + '.' + pad2(first);
    return null;
  }

  if ((match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text))) [, year, month, day] = match;
  else if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(text))) [, year, month, day] = match;
  else if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text))) {
    [, day, month, year] = match;
    if (Number(month) > 12 && Number(day) <= 12) [day, month] = [month, day];
  } else return null;

  const iso = year + '-' + pad2(Number(month)) + '-' + pad2(Number(day));
  const date = new Date(iso + 'T00:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso || iso < '1900-01-01') return null;
  return iso.replace(/-/g, '.');
}
