/*
 * DATES ARE WRITTEN ONE WAY, AND ONLY ONE PLACE DECIDES WHAT IT IS.
 *
 * The storefront formatted dates nine different ways in nine components -
 * `toLocaleDateString()` in most of them, `String(value).slice(0, 10)` in the
 * rest. Two problems, and the second is the one that survives a code review:
 *
 *   THEY DISAGREED WITH EACH OTHER. A repair was dated 14/09/2026 and the
 *   order that paid for it 2026-09-14, on pages one click apart.
 *
 *   `toLocaleDateString` FOLLOWS THE BROWSER, not the language the member
 *   picked in the header. So the same page shows 14/09/2026 to a British
 *   browser and 9/14/2026 to an American one, and those two disagree about
 *   which number is the month - on a site whose own language switcher had no
 *   say in it at all.
 *
 * Neither is visible in a diff that adds one more `toLocaleDateString()` to
 * one more page, which is why this is a test and not a convention.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

/** Every .js under src/, tests and the formatter itself excluded. */
function sources(dir, found) {
  const out = found || [];

  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);

    if (fs.statSync(full).isDirectory()) {
      if (name === 'node_modules') return;
      sources(full, out);
      return;
    }

    if (!/\.js$/.test(name)) return;
    if (/\.test\.js$/.test(name)) return;
    /* The one file allowed to know how a date is spelled. */
    if (full === path.join(SRC, 'utils', 'format.js')) return;

    out.push(full);
  });

  return out;
}

const FORBIDDEN = [
  {
    /*
     * Locale-dependent date formatting. `Number(x).toLocaleString()` is fine
     * and common, so the pattern requires a Date on the left rather than
     * banning the method name.
     */
    re: /new Date\([^)]*\)\s*\.toLocale(Date|Time)?String\s*\(/,
    why: 'formats a date through the BROWSER locale, not the member\'s chosen language'
  },
  {
    /* The hand-rolled 'YYYY-MM-DD', which is a different format from ours. */
    re: /\.slice\(\s*0\s*,\s*10\s*\)/,
    why: 'slices an ISO date by hand instead of formatting it'
  },
  {
    re: /\.slice\(\s*0\s*,\s*16\s*\)/,
    why: 'slices an ISO timestamp by hand instead of formatting it'
  }
];

test('no page formats a date by itself', () => {
  const offences = [];

  sources(SRC).forEach((file) => {
    const text = fs.readFileSync(file, 'utf8');

    text.split('\n').forEach((line, index) => {
      FORBIDDEN.forEach((rule) => {
        if (!rule.re.test(line)) return;
        offences.push(
          path.relative(SRC, file) + ':' + (index + 1) + '  ' + rule.why +
          '\n    ' + line.trim()
        );
      });
    });
  });

  expect(offences).toEqual([]);
});

/*
 * AND THE SHAPES THEMSELVES, because "everything calls one helper" is only
 * worth having if the helper writes what was asked for: YYYY.MM.DD, and
 * YYYY.MM.DD hh:mm:ss for a time.
 */
const { date, dateMinute, dateTime } = require('../utils/format');

test('a date is YYYY.MM.DD', () => {
  expect(date('2026-09-14')).toBe('2026.09.14');
  /* Single digits are padded - 2026.9.4 sorts and scans differently. */
  expect(date('2026-01-04')).toBe('2026.01.04');
  expect(date('2026-09-14T15:04:09Z')).toBe('2026.09.14');
});

test('a timestamp is YYYY.MM.DD hh:mm:ss, and to the minute where a minute is enough', () => {
  /* Local time, built from local fields - so the assertion builds the input
     the same way rather than hardcoding a zone the test machine may not be in. */
  const at = new Date(2026, 8, 14, 15, 4, 9);

  expect(dateTime(at)).toBe('2026.09.14 15:04:09');
  expect(dateMinute(at)).toBe('2026.09.14 15:04');
});

test('a date-only string is not dragged across a timezone', () => {
  /*
   * THE BUG THIS PREVENTS. 'YYYY-MM-DD' means that calendar day everywhere,
   * but `new Date('2026-09-14')` reads it as UTC midnight - so west of
   * Greenwich it renders as the 13th. Anybody "simplifying" the text path in
   * format.js into a `new Date` call fails here, in every timezone that would
   * actually have suffered it.
   */
  expect(date('2026-09-14')).toBe('2026.09.14');
  expect(date('2026-01-01')).toBe('2026.01.01');
});

test('nothing in, nothing out - never "Invalid Date"', () => {
  [null, undefined, ''].forEach((empty) => {
    expect(date(empty)).toBe('—');
    expect(dateTime(empty)).toBe('—');
    expect(dateMinute(empty)).toBe('—');
  });

  expect(date('not a date')).toBe('—');
  expect(dateTime('not a date')).toBe('—');
});
