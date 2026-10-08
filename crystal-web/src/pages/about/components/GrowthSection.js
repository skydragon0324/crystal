import React, { useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

import SectionHeading from './SectionHeading';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * ELEVEN YEARS, AS ONE CHART.
 *
 * THE FIGURES ARE PLOTTED AS THEY ARE GIVEN, and the reason is in the data:
 * every series in content.js GROWTH is already an INDEX, 2015 = 100. They
 * arrive on one scale, so the chart does no arithmetic at all - 793 on the
 * business line is 793% of 2015, and the line's height is that number.
 *
 * THIS REPLACED A CHART THAT DIVIDED EACH SERIES BY ITS OWN FIRST YEAR to
 * put three different units on one axis. That was right for the figures it
 * had and is impossible for these: income and benefit both START at zero,
 * and a series indexed against zero is a division by zero, not a line.
 *
 * THE AXIS CARRIES NO NUMBERS, only "(%)" at the top of it. The gridlines
 * still say how the heights compare, which is what a reader actually uses
 * them for; the exact figure for any year is one hover away in the legend,
 * where it can be read as a number instead of guessed off an axis.
 *
 * THERE IS NO TABLE UNDER IT. It repeated every figure a second time and
 * made the chapter twice as tall as the story it tells. The numbers live in
 * content.js, GROWTH.years - that is where to change them.
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
  total: '#0072B2',
  business: '#009E73',
  engineers: '#56B4E9',
  income: '#D55E00',
  benefit: '#CC79A7'
};

const FALLBACK_HUE = '#6E7781';

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

  /*
   * THE VALUES THEMSELVES. They are already percentages of 2015 - see the
   * note at the top - so there is nothing to scale and nothing that can be
   * distorted by scaling.
   */
  const values = series.map((entry) => years.map((row) => Number(row[entry.key]) || 0));

  const highest = values.reduce(
    (top, list) => Math.max(top, Math.max.apply(null, list)), 1
  );

  /*
   * Five gridlines, at a round number above the highest line. The reader
   * never sees these numbers - the axis is unlabelled by design - so the step
   * is chosen to divide the plot evenly rather than to read well.
   */
  const rough = highest / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = Math.ceil(rough / magnitude) * magnitude;
  const top = Math.ceil(highest / step) * step;

  const xOf = (index) => PAD.left + (index / (years.length - 1)) * usableW;
  const yOf = (value) => PAD.top + usableH - (value / top) * usableH;

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
      base: values[position][0],
      points: values[position].map((value, index) => ({
        x: xOf(index),
        y: yOf(value),
        value,
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

  /*
   * THE UNIT COMES FROM THE CONTENT, not from this file. It is the only
   * word on the axis, and the content files for every language carry it
   * (content.zh, content.ru) - a hardcoded one here would be the single
   * untranslated mark on a translated chart.
   */
  const percent = (growth.unit && growth.unit.percent) || String.fromCharCode(37);
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
          * THE LEGEND IS A COLOUR KEY, AND ONLY THAT.
          *
          * It used to carry each series' latest figure and its growth as a
          * multiple, and swap them for whichever year was under the pointer.
          * Five names, five figures and five multiples above a five-line
          * chart is the chart written out again in words: the reader has to
          * choose which of the two to believe, and the numbers win - at which
          * point the chart is decoration.
          *
          * So this says which colour is which measure, and the plot says how
          * much. The year under the pointer still shows ON the chart, where
          * the reader is looking, rather than here.
          */}
        <Flex
          gap="6" data-gap="24" data-gap-wrap
          wrap="wrap"
          mb="4"
          align="center"
        >
          {chart.lines.map((line) => (
            <Flex key={line.series.key} align="center" gap="2" data-gap="8">
              <Box
                w="10px"
                h="10px"
                borderRadius="2px"
                bg={line.hue}
                flexShrink={0}
              />
              <Text fontSize="sm" color={surface.text} fontWeight="600">
                {t(line.series.label)}
              </Text>
            </Flex>
          ))}
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
            <line
              key={tick}
              x1={PAD.left}
              y1={chart.yOf(tick)}
              x2={W - PAD.right}
              y2={chart.yOf(tick)}
              stroke="currentColor"
              strokeOpacity={tick === 0 ? 0.24 : 0.08}
              strokeWidth="1"
            />
          ))}

          {/*
            * THE AXIS SAYS WHAT IT IS, AND NOTHING ELSE.
            *
            * One "(%)" at the top, where an axis label belongs, and no
            * numbers down the side. The gridlines still carry the comparison
            * - which line is twice another's height - and a reader who wants
            * a figure gets the real one in the legend by pointing at a year,
            * rather than estimating it against a tick.
            */}
          <text
            x={PAD.left - 8}
            y={PAD.top - 4}
            textAnchor="end"
            fontSize="11"
            fontWeight="600"
            fill="currentColor"
            fillOpacity="0.55"
          >
            {'(' + percent + ')'}
          </text>

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

      </Box>
    </Box>
  );
}
