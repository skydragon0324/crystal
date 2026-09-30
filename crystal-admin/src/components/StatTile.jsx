import React from 'react';
import { Box, Flex, Icon, Text } from '@chakra-ui/react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { MdArrowUpward, MdArrowDownward } from 'react-icons/md';
import { useT } from '../i18n';
import { useSurface, trendOf } from '../theme/tokens';

/**
 * A number that is the whole story.
 *
 * Used instead of a one-bar chart or a two-slice pie, which is what these
 * would otherwise become.  The figure is set in proportional figures -
 * tabular digits make a large standalone number look loose, and belong in
 * table rows where digits have to line up.
 *
 * `delta` and `series` are both OPTIONAL and neither is invented.  A tile
 * shows a trend arrow only where the API actually sends a comparison, and a
 * sparkline only where it sends a series; a made-up "+12.5%" under a real
 * figure is worse than no arrow at all, because it reads exactly like a
 * measurement.
 */
export default function StatTile({
  label, value, hint, icon, tone, onClick, delta, higherIsBetter, series
}) {
  const t = useT();
  const surface = useSurface();

  const tones = {
    critical: 'red.500',
    serious: 'orange.500',
    good: 'green.500',
    default: surface.text
  };

  const trend = delta === undefined || delta === null ? null : trendOf(delta, higherIsBetter);
  const spark = (series || []).filter(function (point) {
    return point && point.value !== null && point.value !== undefined;
  });

  return (
    <Box
      bg={surface.card}
      borderWidth="1px"
      borderColor={surface.border}
      borderRadius="card"
      px="1rem"
      pt="0.875rem"
      pb={spark.length ? '0' : '0.875rem'}
      overflow="hidden"
      cursor={onClick ? 'pointer' : 'default'}
      onClick={onClick}
      _hover={onClick ? { borderColor: 'brand.400' } : undefined}
      transition="border-color 120ms ease"
    >
      <Flex align="center" gap="0.375rem" data-gap="6" mb="0.375rem">
        {icon ? <Icon as={icon} boxSize="0.875rem" color={surface.muted} /> : null}
        <Text fontSize="xs" color={surface.muted} noOfLines={1}>{t(label)}</Text>
      </Flex>

      <Flex align="baseline" gap="0.5rem" data-gap="8" data-gap-wrap wrap="wrap">
        <Text
          fontSize="1.625rem" fontWeight="600" lineHeight="1.15"
          letterSpacing="-0.02em" color={tones[tone || 'default']}
        >
          {value === null || value === undefined ? '-' : value}
        </Text>

        {trend && trend.value !== 0 ? (
          <Flex align="center" gap="1px" data-gap="1" color={trend.tone + '.500'}>
            <Icon as={trend.value > 0 ? MdArrowUpward : MdArrowDownward} boxSize="0.75rem" />
            <Text fontSize="xs" fontWeight="600">
              {Math.abs(trend.value)}%
            </Text>
          </Flex>
        ) : null}
      </Flex>

      {hint ? (
        <Text fontSize="0.6875rem" color={surface.muted} mt="3px" noOfLines={1}>{hint}</Text>
      ) : null}

      {/*
        * The sparkline is drawn edge to edge at the foot of the tile rather
        * than boxed inside it - it is a texture for the number above, not a
        * chart somebody is meant to read values off, so it carries no axes,
        * no grid and no tooltip.
        */}
      {spark.length > 1 ? (
        <Box mx="-1rem" mt="0.5rem" h="2.125rem">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="statTileFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chakra-colors-brand-500)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--chakra-colors-brand-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--chakra-colors-brand-500)"
                strokeWidth={1.5}
                fill="url(#statTileFill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      ) : null}
    </Box>
  );
}
