/*
 * THE GROWTH FIGURE IS ONE CHART WITH FIVE LINES, and what makes that
 * legitimate is that the figures are ALREADY on one scale.
 *
 * It used to index them here: each series divided by its own first year, so
 * that headcount and revenue could share an axis as multiples. The real
 * figures arrived as index numbers - 2015 is 100, and 793 means 7.9 times -
 * and two of the five START AT ZERO, which no amount of dividing survives.
 * So the chart plots what it is given, and these tests hold that:
 *
 *   the lines are drawn from the raw values, in the right order vertically
 *   a zero is a point on the line, not an Infinity or a NaN
 *   the axis says "%" once, and names no figures of its own
 *
 * THE Y-AXIS CARRIES NO NUMBERS BY REQUEST. That is not a detail to leave
 * untested: tick labels are the kind of thing a later change puts back, and
 * the chart is only readable as "a percentage of 2015" because the axis is
 * quiet and the legend carries the figures.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';

import GrowthSection from '../pages/about/components/GrowthSection';
import { I18nProvider } from '../i18n';
import { number } from '../utils/format';
import { GROWTH } from '../pages/about/content';

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

/** Every point of a path, as [x, y] pairs. */
function pointsOf(path) {
  return path.getAttribute('d').split(/[ML]/).filter(Boolean)
    .map((pair) => pair.trim().split(/\s+/).map(Number));
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

test('the lines are the figures as given, not re-indexed to their first year', () => {
  /*
   * THE ASSERTION THAT MATTERS.
   *
   * Indexing would put every line at the same starting height, because every
   * series would start at 1. These figures do not: in 2015 three of them
   * stand at 100 and two at 0, so the first points must sit at TWO different
   * heights - and the pair at zero must be the lowest point on the chart.
   */
  const host = render(GROWTH);
  const paths = [...host.querySelectorAll('svg path')];

  const first = GROWTH.years[0];
  const starts = paths.map((path) => Math.round(pointsOf(path)[0][1]));

  /* Two heights, not one: the re-indexed chart would have exactly one. */
  expect(new Set(starts).size).toBe(2);

  /* In SVG a bigger y is lower, so the series that start at 0 are the floor. */
  const zeroed = GROWTH.series
    .map((series, index) => (first[series.key] === 0 ? starts[index] : null))
    .filter((y) => y !== null);
  const standing = GROWTH.series
    .map((series, index) => (first[series.key] === 0 ? null : starts[index]))
    .filter((y) => y !== null);

  expect(zeroed.length).toBe(2);
  expect(Math.min.apply(null, zeroed)).toBeGreaterThan(Math.max.apply(null, standing));

  /*
   * And the tallest figure of the last year is the highest point of it, which
   * is what says the scale is shared rather than per-series.
   */
  const last = GROWTH.years[GROWTH.years.length - 1];
  const values = GROWTH.series.map((series) => last[series.key]);
  const ends = paths.map((path) => {
    const points = pointsOf(path);
    return points[points.length - 1][1];
  });

  const highest = values.indexOf(Math.max.apply(null, values));
  const lowest = values.indexOf(Math.min.apply(null, values));
  expect(ends[highest]).toBeLessThan(ends[lowest]);
});

test('the chart names its colours, and writes no figures anywhere', () => {
  /*
   * THE CHART IS READ AS SHAPE. The legend used to carry every series' latest
   * figure and its growth as a multiple, which is the chart written out again
   * in words - and when a reader is given both, the numbers win and the plot
   * becomes decoration. So: a swatch and a name per series, the unit on the
   * axis, and not one figure in the furniture.
   */
  const host = render(GROWTH);
  const text = host.textContent;

  const last = GROWTH.years[GROWTH.years.length - 1];

  /* Every series is NAMED. */
  GROWTH.series.forEach((series) => {
    expect(text).toContain(series.label);
  });

  /*
   * And none is quantified. The site's own number shape is what to look for,
   * not the browser's: thousands are grouped with a space (utils/format), so
   * `toLocaleString` would hunt for a comma no reader is ever shown.
   */
  GROWTH.series.forEach((series) => {
    expect(text).not.toContain(number(last[series.key]));
  });

  /* Nor the multiples the legend used to print beside them. */
  expect(text).not.toContain('×');

  /* The unit, once. */
  expect(text).toContain('%');

  /*
   * NO TICK LABELS. Every <text> in the chart is either a year along the
   * bottom or the unit itself - so a gridline figure creeping back in fails
   * here rather than being noticed on the page.
   */
  const years = GROWTH.years.map((row) => String(row.year));
  const labels = [...host.querySelectorAll('svg text')].map((node) => node.textContent.trim());

  labels.forEach((label) => {
    const axis = '(' + GROWTH.unit.percent + ')';
    expect(years.indexOf(label) !== -1 || label === axis).toBe(true);
  });

  expect(host.querySelectorAll('table')).toHaveLength(0);
});

test('a series that stands at zero is a line, not a hole in one', () => {
  /*
   * Income and benefit are 0 in 2015 and 7 in 2021 - a real figure, a real
   * low point - and an earlier version of this chart divided by the first
   * year, which made both of them Infinity and every point NaN. A flat zero
   * is the same trap with none of the data to hide it.
   */
  const host = render({
    unit: GROWTH.unit,
    series: [{ key: 'flat', label: 'Flat' }],
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
