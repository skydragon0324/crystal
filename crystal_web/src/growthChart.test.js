/*
 * THE GROWTH FIGURE IS ONE CHART WITH THREE LINES, and the thing that makes
 * that legitimate is the indexing.
 *
 * Employees, engineers and revenue are counted in different units, so they
 * can only share an axis as multiples of their own first year. If that
 * arithmetic is wrong the chart still draws - three lines, plausible shapes,
 * no error anywhere - and it is simply not true. So it is checked here.
 *
 * The other half of the design is that indexing destroys "how many", so the
 * raw figures have to survive somewhere: the legend for the latest year, and
 * the table for every year.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';

import GrowthSection from './pages/about/components/GrowthSection';
import { I18nProvider } from './i18n';
import { GROWTH } from './pages/about/content';

function render(growth) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  act(() => {
    ReactDOM.render(
      <ChakraProvider>
        <I18nProvider>
          <GrowthSection growth={growth} />
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  return host;
}

test('every series is drawn, on one set of axes', () => {
  const host = render(GROWTH);

  /* One <svg>, not one per measure - that is the whole change. */
  expect(host.querySelectorAll('svg').length).toBe(1);

  const lines = host.querySelectorAll('svg path');
  expect(lines.length).toBe(GROWTH.series.length);

  /* Every line has a point for every year. */
  lines.forEach((path) => {
    const commands = path.getAttribute('d').match(/[ML]/g) || [];
    expect(commands.length).toBe(GROWTH.years.length);
  });
});

test('each line is indexed to its own first year', () => {
  /*
   * THE ASSERTION THAT MATTERS.
   *
   * Every series starts at 1x, so on a shared scale every line starts at the
   * SAME height - and ends at a height ordered by how much it actually grew.
   * Revenue grew fastest (48x against headcount's 15x), so its last point
   * must sit highest, which in SVG means the smallest y.
   */
  const host = render(GROWTH);
  const paths = [...host.querySelectorAll('svg path')];

  const ends = paths.map((path) => {
    const points = path.getAttribute('d').split(/[ML]/).filter(Boolean)
      .map((pair) => pair.trim().split(/\s+/).map(Number));
    return { first: points[0], last: points[points.length - 1] };
  });

  /* Same starting height, to a rounding place. */
  const starts = ends.map((e) => Math.round(e.first[1]));
  expect(new Set(starts).size).toBe(1);

  /* Ordered by growth: employees 15.2x, engineers 22.9x, revenue 48.0x. */
  const growthOf = GROWTH.series.map((series) => {
    const rows = GROWTH.years;
    return rows[rows.length - 1][series.key] / rows[0][series.key];
  });

  const fastest = growthOf.indexOf(Math.max.apply(null, growthOf));
  const slowest = growthOf.indexOf(Math.min.apply(null, growthOf));

  expect(ends[fastest].last[1]).toBeLessThan(ends[slowest].last[1]);
});

test('the raw numbers survive the indexing', () => {
  /*
   * A multiple answers "how fast" and destroys "how many". The latest real
   * figure has to be on screen in the legend, and every year of them in the
   * table, or the chart has quietly replaced the data with a ratio.
   */
  const host = render(GROWTH);
  const text = host.textContent;

  const last = GROWTH.years[GROWTH.years.length - 1];

  expect(text).toContain(Number(last.employees).toLocaleString());
  expect(text).toContain(String(last.income));

  /* Every year has a row, and the table holds the raw values. */
  const rows = host.querySelectorAll('tbody tr');
  expect(rows.length).toBe(GROWTH.years.length);
  expect(rows[0].textContent).toContain(String(GROWTH.years[0].employees));
});

test('a series with no growth does not divide by zero', () => {
  /*
   * The index divides by the first year, so a series that starts at zero -
   * a measure introduced later, which is exactly what gets added to this
   * data - would otherwise render as Infinity and produce a path of NaN.
   */
  const host = render({
    unit: GROWTH.unit,
    series: [{ key: 'flat', label: 'Flat', suffix: '' }],
    years: [
      { year: 2020, flat: 0 },
      { year: 2021, flat: 0 },
      { year: 2022, flat: 0 }
    ]
  });

  const d = host.querySelector('svg path').getAttribute('d');
  expect(d).not.toContain('NaN');
  expect(d).not.toContain('Infinity');
});
