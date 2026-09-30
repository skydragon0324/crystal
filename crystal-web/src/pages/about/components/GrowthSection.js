import React, { useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

import SectionHeading from './SectionHeading';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { number } from '@/utils/format';

/**
 * ELEVEN YEARS, AS ONE CHART.
 *
 * THE PROBLEM THIS SOLVES, because it is the whole design.
 *
 * Employees run to eighteen hundred, engineers to four hundred, revenue to
 * two hundred million dollars. Three quantities, three units, one pair of
 * axes. There are only three ways to draw that, and two of them are wrong:
 *
 *   A SECOND Y-AXIS is the worst thing a chart can do. Where the lines cross
 *   is decided by whoever picked the two scales, so the reader sees a
 *   relationship that is an artefact of the drawing.
 *
 *   ONE SHARED AXIS OF RAW VALUES puts revenue and engineers along the
 *   bottom as flat lines, because 412 next to 1820 is not a shape.
 *
 *   EACH SERIES AS A MULTIPLE OF ITS OWN FIRST YEAR is the third, and it is
 *   the honest one. Every line starts at 1 and the axis means "how many
 *   times bigger than {first year}" - which is the question a growth chart
 *   is asked. The units cancel, so the comparison is legitimate: revenue is
 *   up 48x against headcount's 15x, and that is a real fact about the
 *   company rather than an accident of scaling.
 *
 * THE RAW NUMBERS ARE STILL ON SCREEN. Indexing answers "how fast" and
 * destroys "how many", so the actual figures are in the legend: the latest
 * year by default, and whichever year is under the pointer.
 *
 * THERE IS NO TABLE UNDER IT ANY MORE. It repeated every figure a second time
 * and made the chapter twice as tall as the story it tells. The numbers
 * themselves live in content.js, GROWTH.years - that is where to change them.
 *
 * DRAWN AS SVG BY HAND. The site targets Chrome 72 and adds no dependency for
 * one figure; eleven points and a path string is less code than the wrapper
 * around a charting library would be.
 */

/* The plotting box, in user units. The viewBox scales it to any width. */
const W = 720;
const H = 300;
const PAD = { top: 18, right: 18, bottom: 36, left: 46 };

/**
 * ONE HUE PER SERIES, from Okabe-Ito.
 *
 * A categorical palette chosen because it stays distinguishable under every
 * common form of colour blindness - the alternative is three hues that look
 * like three hues to the person who picked them. Colour is not the only
 * channel here anyway: each line is labelled in the legend.
 *
 * Fixed rather than themed, because these encode data. A hue that shifts
 * with the colour mode would mean the legend and the line disagree for
 * anyone reading a screenshot.
 */
const HUES = {
  employees: '#0072B2',
  engineers: '#009E73',
  income: '#D55E00'
};

const FALLBACK_HUE = '#6E7781';

/**
 * A raw value, written the way its series writes it.
 *
 * PRECISION COMES FROM THE VALUE, not from its magnitude. This used to round
 * anything at or above a hundred to a whole number, which is defensible for a
 * headcount and wrong for money: revenue of 201.5 million was printed as
 * $202m in a legend that was supposed to be exact.
 * A count is an integer and prints as one; a figure with a decimal keeps it.
 */
function format(value, series) {
  const exact = Number(value);

  /*
   * THE SITE'S OWN NUMBER SHAPE, not the browser's: thousands grouped with a
   * space, and no trailing zero after the point. toLocaleString followed the
   * reader's browser rather than the language they chose in the header, so the
   * same chart was 40,000 to one reader and 40.000 to another.
   */
  const text = number(exact);

  return (series.prefix || '') + text + (series.suffix || '');
}

/** A multiple, to one decimal place unless it is large enough not to need one. */
function formatMultiple(value) {
  return (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10) + '×';
}

/**
 * Every series in plot coordinates, sharing one y-scale.
 *
 * The scale runs from ZERO rather than from 1. Starting at the first value
 * would put every line's origin in the corner at a slope the data does not
 * support, and this figure exists to be believed rather than to look steep.
 */
function plot(years, series) {
  const usableW = W - PAD.left - PAD.right;
  const usableH = H - PAD.top - PAD.bottom;

  /* Each series against its own first year, so the units cancel. */
  const multiples = series.map((entry) => {
    const base = Number(years[0][entry.key]) || 1;
    return years.map((row) => (Number(row[entry.key]) || 0) / base);
  });

  const highest = multiples.reduce(
    (top, list) => Math.max(top, Math.max.apply(null, list)), 1
  );

  /* A round number above the highest line, so the axis labels are readable. */
  const step = highest <= 10 ? 2 : highest <= 25 ? 5 : 10;
  const top = Math.ceil(highest / step) * step;

  const xOf = (index) => PAD.left + (index / (years.length - 1)) * usableW;
  const yOf = (multiple) => PAD.top + usableH - (multiple / top) * usableH;

  const ticks = [];
  for (let at = 0; at <= top; at += step) ticks.push(at);

  return {
    top,
    ticks,
    xOf,
    yOf,
    lines: series.map((entry, position) => ({
      series: entry,
      hue: HUES[entry.key] || FALLBACK_HUE,
      points: multiples[position].map((multiple, index) => ({
        x: xOf(index),
        y: yOf(multiple),
        multiple,
        value: Number(years[index][entry.key]) || 0,
        year: years[index].year
      }))
    }))
  };
}

export default function GrowthSection({ growth }) {
  const t = useT();
  const surface = useSurface();

  /* Which year the reader is pointing at; the legend shows that year's figures. */
  const [hover, setHover] = useState(null);

  if (!growth || !growth.years || growth.years.length < 2) return null;

  const years = growth.years;
  const first = years[0];
  const last = years[years.length - 1];

  const chart = plot(years, growth.series);
  const step = (W - PAD.left - PAD.right) / (years.length - 1);

  const activeIndex = hover === null
    ? -1
    : years.map((row) => row.year).indexOf(hover);

  return (
    <Box>
      <SectionHeading
        eyebrow={t('about.components.growthsection.growth')}
        title={t('about.components.growthsection.elevenYearsOnOneScale')}
        number={chapterNumber('growth')}
        description={t('about.components.growthsection.everyMeasureAsAMultiple', {
          from: first.year, to: last.year
        })}
      />

      <Box mt="8" p={{ base: 4, md: 6 }} borderRadius="16px" bg={surface.raised}>
        {/*
          * THE LEGEND CARRIES THE NUMBERS.
          *
          * The chart's axis is a multiple, which is the one thing a reader
          * should not have to convert back in their head. So each series
          * names itself, its latest real figure, and its growth in one row -
          * and hovering the chart swaps the figures for that year rather
          * than opening a tooltip that follows the cursor.
          */}
        <Flex
          gap="6" data-gap="24" data-gap-wrap
          wrap="wrap"
          mb="4"
          align="baseline"
        >
          {chart.lines.map((line) => {
            const point = activeIndex === -1
              ? line.points[line.points.length - 1]
              : line.points[activeIndex];

            return (
              <Flex key={line.series.key} align="baseline" gap="2" data-gap="8">
                <Box
                  w="10px"
                  h="10px"
                  borderRadius="2px"
                  bg={line.hue}
                  flexShrink={0}
                  transform="translateY(-1px)"
                />
                <Box>
                  <Text fontSize="xs" color={surface.muted} fontWeight="600">
                    {t(line.series.label)}
                  </Text>
                  <Flex align="baseline" gap="2" data-gap="8">
                    <Text
                      fontSize="xl"
                      fontWeight="800"
                      color={surface.text}
                      letterSpacing="-0.02em"
                      lineHeight="1.2"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {format(point.value, line.series)}
                    </Text>
                    <Text fontSize="xs" fontWeight="700" color={line.hue}>
                      {formatMultiple(point.multiple)}
                    </Text>
                  </Flex>
                </Box>
              </Flex>
            );
          })}

          <Text fontSize="xs" color={surface.muted} ml="auto">
            {activeIndex === -1 ? last.year : years[activeIndex].year}
          </Text>
        </Flex>

        <Box
          as="svg"
          viewBox={'0 0 ' + W + ' ' + H}
          w="100%"
          h="auto"
          display="block"
          color={surface.text}
          role="img"
          aria-label={t('about.components.growthsection.eachMeasureFromTo', {
            from: first.year, to: last.year
          })}
          onMouseLeave={() => setHover(null)}
        >
          {/*
            * Gridlines rather than a single baseline: with one shared scale
            * the reader is comparing heights across the whole plot, which is
            * exactly what a gridline is for.
            */}
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                y1={chart.yOf(tick)}
                x2={W - PAD.right}
                y2={chart.yOf(tick)}
                stroke="currentColor"
                strokeOpacity={tick === 0 ? 0.24 : 0.08}
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={chart.yOf(tick) + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                fillOpacity="0.5"
              >
                {tick + '×'}
              </text>
            </g>
          ))}

          {/* The year under the pointer, behind the lines so it never hides one. */}
          {activeIndex !== -1 && (
            <line
              x1={chart.xOf(activeIndex)}
              y1={PAD.top}
              x2={chart.xOf(activeIndex)}
              y2={H - PAD.bottom}
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="1"
            />
          )}

          {chart.lines.map((line) => (
            <path
              key={line.series.key}
              d={line.points.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ')}
              fill="none"
              stroke={line.hue}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* The endpoint of each line is the figure in the legend. */}
          {chart.lines.map((line) => {
            const point = activeIndex === -1
              ? line.points[line.points.length - 1]
              : line.points[activeIndex];

            return (
              <circle
                key={line.series.key}
                cx={point.x}
                cy={point.y}
                r="4"
                fill={line.hue}
                stroke="var(--chakra-colors-chakra-body-bg)"
                strokeWidth="2"
              />
            );
          })}

          {/*
            * THE HIT TARGETS ARE WIDER THAN THE POINTS.
            *
            * A 4px dot is not something a pointer finds, so each year owns a
            * full-height invisible band. Eleven of them tile the plot, which
            * is also why there is no need to work out the nearest point from
            * the mouse position.
            */}
          {years.map((row, index) => (
            <rect
              key={row.year}
              x={chart.xOf(index) - step / 2}
              y={PAD.top}
              width={step}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(row.year)}
            />
          ))}

          {/*
            * Every other year is labelled. Eleven labels at this width
            * collide on a phone; pointing at any year puts its figures in the
            * legend above, so the unlabelled ones are still one gesture away.
            */}
          {years.map((row, index) => (
            index % 2 === 0 || index === years.length - 1 ? (
              <text
                key={row.year}
                x={chart.xOf(index)}
                y={H - 12}
                textAnchor={index === 0 ? 'start' : index === years.length - 1 ? 'end' : 'middle'}
                fontSize="10"
                fill="currentColor"
                fillOpacity={hover === row.year ? 0.9 : 0.5}
                fontWeight={hover === row.year ? '700' : '400'}
              >
                {row.year}
              </text>
            ) : null
          ))}
        </Box>

        <Text fontSize="xs" color={surface.muted} mt="3">
          {t('about.components.growthsection.theAxisIsAMultiple', { year: first.year })}
        </Text>
      </Box>
    </Box>
  );
}
