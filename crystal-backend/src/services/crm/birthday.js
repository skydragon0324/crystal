/*
 * A birthday typed into a search box, read the way the person meant it.
 *
 *   a whole date   1990-05-03, 1990.05.03, 1990/5/3, 19900503, 03.05.1990, 03/05/1990
 *   a year alone   1990                  (1900 to this year)
 *   a day alone    05-03, 03.05, 5/3     (any year)
 *
 * A whole date written day first is read as day.month unless the second part
 * cannot be a month (05/23/1990). A day without a year has no such rule worth
 * trusting - 05-03 is the 3rd of May to one reader and the 5th of March to
 * another - so when both parts could be the month, both readings are searched.
 * Anything that is not a real date is null, so a phone number or a customer
 * number is never mistaken for a birthday.
 *
 * The result is one of { date }, { year } or { days: [[month, day], ...] };
 * the helpers below turn it into a condition on a person row or on text.
 */
function searchBirthday(value) {
 const text = String(value == null ? '' : value).trim();
 let year, month, day, match;
 if ((match = text.match(/^(\d{4})$/))) {
  const only = Number(match[1]);
  return only >= 1900 && only <= new Date().getFullYear() ? { year: only } : null;
 }
 if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})$/))) {
  const [first, second] = [Number(match[1]), Number(match[2])];
  const days = [[first, second], [second, first]].filter(([m, d], i) => isDay(m, d) && !(i === 1 && first === second));
  return days.length ? { days: days } : null;
 }
 if ((match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [, year, month, day] = match;
 else if ((match = text.match(/^(\d{4})(\d{2})(\d{2})$/))) [, year, month, day] = match;
 else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
  [, day, month, year] = match;
  if (Number(month) > 12 && Number(day) <= 12) [day, month] = [month, day];
 } else return null;
 const iso = year + '-' + pad(month) + '-' + pad(day);
 const date = new Date(iso + 'T00:00:00Z');
 if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso || iso < '1900-01-01') return null;
 return { date: iso };
}

function pad(number) { return String(number).padStart(2, '0'); }

/* A day that exists in some year: 2000 was a leap year, so the 29th of February counts. */
function isDay(month, day) {
 const date = new Date(Date.UTC(2000, month - 1, day));
 return month >= 1 && month <= 12 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The birthday as a condition on a crm_person row named `alias`, added with AND
 * to `qb` (the inside of an EXISTS). A year matches birth_year, which a person
 * known only by their year still has, as well as the year of birth_date.
 */
function wherePersonBorn(qb, alias, birthday) {
 const column = alias + '.birth_date';
 if (birthday.date) return qb.where(column, birthday.date);
 if (birthday.year) {
  return qb.where(function () { this.where(alias + '.birth_year', birthday.year).orWhereRaw('EXTRACT(YEAR FROM ??) = ?', [column, birthday.year]); });
 }
 return qb.where(function () {
  birthday.days.forEach(([month, day]) => {
   this.orWhereRaw('(EXTRACT(MONTH FROM ??) = ? AND EXTRACT(DAY FROM ??) = ?)', [column, month, column, day]);
  });
 });
}

/**
 * A PostgreSQL regular expression for the birthday written as text, year first,
 * with any of - / . between the parts and the zeros optional: what a
 * registration carries (1990-05-03) and what an Excel cell held (1990/5/3, or
 * 1990-05-03T00:00:00.000Z for a date cell).
 */
function textPattern(birthday) {
 const part = (number) => '0?' + Number(number) + '(?![0-9])';
 if (birthday.date) {
  const [year, month, day] = birthday.date.split('-');
  return '^' + year + '[-/.]' + part(month) + '[-/.]' + part(day);
 }
 if (birthday.year) return '^' + birthday.year + '(?![0-9])';
 return '^[0-9]{4}[-/.](' + birthday.days.map(([month, day]) => part(month) + '[-/.]' + part(day)).join('|') + ')';
}

module.exports = { searchBirthday, wherePersonBorn, textPattern };
