import React from 'react';
import { Box, Button, Flex, HStack, Icon, Stack, Tag, Text, useColorModeValue, useToken } from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { useT } from '../../i18n';
import { useSurface } from '../../theme/tokens';
import { number } from '../../utils/format';
import { word } from './shared';

/**
 * THE CUSTOMER 360 RECORD'S VISUAL PARTS - the card every block sits in, the
 * small figures and charts inside them, and the coloured words for statuses.
 *
 * Charts here are plain SVG, not recharts: a sparkline in a card is twelve
 * points and needs no axes, tooltip or resize observer.
 */

/** A titled block of the record: icon, title, an action, and a "View all" that opens the matching tab. */
export function Card360({ icon, title, action, onViewAll, children, padded }) {
  const translate = useT();
  const surface = useSurface();
  return (
    <Box borderWidth="1px" borderColor={surface.border} borderRadius="xl" bg={surface.card} overflow="hidden" minW={0} h="100%">
      <Flex px={4} pt={3.5} pb={2.5} align="center" justify="space-between">
        <HStack spacing={2} minW={0}>
          {icon ? <Icon as={icon} boxSize="1.15rem" color={surface.text} /> : null}
          <Text fontSize="md" fontWeight="700" noOfLines={1}>{title}</Text>
        </HStack>
        <HStack spacing={2} flexShrink={0}>
          {action}
          {onViewAll ? (
            <Button size="xs" variant="link" colorScheme="brand" fontWeight="600" onClick={onViewAll}>{translate('crm.c360.viewAll')}</Button>
          ) : null}
        </HStack>
      </Flex>
      <Box px={padded === false ? 0 : 4} pb={4}>{children}</Box>
    </Box>
  );
}

const TONES = {
  green: ['ACTIVE', 'PRIMARY', 'DELIVERED', 'COMPLETED', 'PAID', 'FINISHED', 'RESOLVED', 'ANSWERED', 'PURCHASED', 'GRANTED',
    'CLOSED', 'FULFILLED', 'SUCCESS', 'ACCEPTED', 'CREDITED', 'PICKED_UP', 'YES', 'OPENED'],
  blue: ['LINKED', 'CLICKED', 'SENT', 'QUEUED', 'DELIVERING', 'APPROVED', 'RESERVED', 'OUTBOUND'],
  orange: ['FOLLOW_UP', 'PENDING', 'IN_PROGRESS', 'WAITING', 'DRAFT', 'NOT_SENT', 'AT_RISK', 'REFUNDED', 'NO_ANSWER'],
  red: ['CANCELLED', 'FAILED', 'INACTIVE', 'DENIED', 'WITHDRAWN', 'URGENT', 'LAPSED', 'TERMINATED', 'EXPIRED', 'REFUND'],
  gray: ['UNLINKED', 'NOT_LINKED', 'NOT_OPENED', 'SKIPPED', 'ENDED', 'NO']
};

export function toneOf(code) {
  const found = Object.keys(TONES).filter((tone) => TONES[tone].indexOf(code) !== -1)[0];
  return found || 'gray';
}

/** A status as a soft coloured pill, coloured by what the code means. */
export function Pill({ code, tone, children }) {
  const translate = useT();
  const scheme = tone || toneOf(code);
  return (
    <Tag size="sm" variant="subtle" colorScheme={scheme} borderRadius="md" fontWeight="600" whiteSpace="nowrap">
      {children || word(translate, code)}
    </Tag>
  );
}

/** A label staff put on the customer, in its own colour. */
export function TagChip({ tag, onRemove }) {
  const translate = useT();
  return (
    <Tag size="sm" variant="subtle" colorScheme={tag.color_scheme || 'gray'} borderRadius="md" fontWeight="600">
      {translate(tag.tag_name)}
      {onRemove ? (
        <Icon as={Md.MdClose} ml={1} boxSize="0.8rem" cursor="pointer" aria-label={translate('common.remove')} onClick={onRemove} />
      ) : null}
    </Tag>
  );
}

/** +18% in green, -6% in red; nothing when there is no year to compare with. */
export function TrendBadge({ value }) {
  if (value === null || value === undefined) return null;
  const rising = Number(value) >= 0;
  return (
    <HStack spacing={0.5} color={rising ? 'green.500' : 'red.500'} fontSize="xs" fontWeight="700">
      <Icon as={rising ? Md.MdArrowDropUp : Md.MdArrowDropDown} boxSize="1.1rem" />
      <Text as="span">{(rising ? '+' : '') + number(value, 0) + '%'}</Text>
    </HStack>
  );
}

/** A line through a few values, scaled to its own box. */
export function Sparkline({ values, height }) {
  const [brand] = useToken('colors', ['brand.500']);
  const list = (values || []).map((value) => Number(value) || 0);
  if (list.length < 2) return null;
  const top = Math.max.apply(null, list);
  const bottom = Math.min.apply(null, list);
  const span = top - bottom || 1;
  const points = list.map((value, position) => {
    const pointX = (position / (list.length - 1)) * 100;
    const pointY = 28 - ((value - bottom) / span) * 24;
    return pointX.toFixed(1) + ',' + pointY.toFixed(1);
  }).join(' ');
  return (
    <Box as="svg" viewBox="0 0 100 30" preserveAspectRatio="none" w="100%" h={height || '2rem'} aria-hidden="true">
      <polyline points={points} fill="none" stroke={brand} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </Box>
  );
}

/** A row of small bars - the last months of something, newest on the right. */
export function MiniBars({ values, color, height }) {
  const [paint] = useToken('colors', [color || 'brand.400']);
  const faint = useColorModeValue('#E2E8F0', '#2D3748');
  const list = (values || []).map((value) => Number(value) || 0);
  if (!list.length) return null;
  const top = Math.max.apply(null, list) || 1;
  const width = 100 / list.length;
  return (
    <Box as="svg" viewBox="0 0 100 30" preserveAspectRatio="none" w="100%" h={height || '1.6rem'} aria-hidden="true">
      {list.map((value, position) => {
        const barHeight = Math.max(2, (value / top) * 28);
        return (
          <rect key={position} x={position * width + width * 0.18} y={30 - barHeight} width={width * 0.64} height={barHeight}
            rx="1" fill={value ? paint : faint} />
        );
      })}
    </Box>
  );
}

/** The RFM score in a hexagon, the way the record shows it. */
export function RfmHexagon({ score }) {
  const [brand, soft] = useToken('colors', ['brand.500', 'brand.50']);
  const fill = useColorModeValue(soft, 'rgba(66,42,251,0.15)');
  return (
    <Box position="relative" w="5.2rem" h="5.6rem" flexShrink={0}>
      <Box as="svg" viewBox="0 0 100 108" w="100%" h="100%" aria-hidden="true">
        <polygon points="50,4 94,29 94,79 50,104 6,79 6,29" fill={fill} stroke={brand} strokeWidth="4" strokeLinejoin="round" />
      </Box>
      <Flex position="absolute" top="0" left="0" right="0" bottom="0" align="center" justify="center">
        <Text fontSize="2xl" fontWeight="800" color="brand.500">{score === null || score === undefined ? '-' : number(score)}</Text>
      </Flex>
    </Box>
  );
}

/** One of the five figures across the top of the record. */
export function HeaderStat({ icon, iconColor, label, value, sub }) {
  const surface = useSurface();
  return (
    <Box minW={0} px={{ base: 0, md: 3 }}>
      <HStack spacing={1.5} mb={1}>
        <Icon as={icon} color={iconColor || 'brand.500'} boxSize="1rem" />
        <Text fontSize="xs" color={surface.muted} noOfLines={1}>{label}</Text>
      </HStack>
      <Text fontSize="xl" fontWeight="800" noOfLines={1} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value === null || value === undefined || value === '' ? '-' : value}
      </Text>
      {sub ? <Text fontSize="xs" color={surface.muted} noOfLines={1}>{sub}</Text> : null}
    </Box>
  );
}

/** A small framed figure inside a card: label, value, a trend and a chart under it. */
export function Tile({ label, value, trend, chart, tone }) {
  const surface = useSurface();
  return (
    <Box borderWidth="1px" borderColor={surface.border} borderRadius="lg" p={3} minW={0}>
      <Text fontSize="xs" color={surface.muted} noOfLines={1}>{label}</Text>
      <HStack spacing={2} align="baseline" mt={1}>
        <Text fontSize="xl" fontWeight="800" color={tone ? tone + '.500' : undefined} noOfLines={1} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {value === null || value === undefined || value === '' ? '-' : value}
        </Text>
        <TrendBadge value={trend} />
      </HStack>
      {chart ? <Box mt={1.5}>{chart}</Box> : null}
    </Box>
  );
}

/** label - value rows, the label in a fixed column. */
export function Facts360({ rows }) {
  const surface = useSurface();
  const translate = useT();
  return (
    <Stack spacing={2}>
      {rows.filter(Boolean).map((row) => (
        <Flex key={row.label} fontSize="sm" align="flex-start">
          <Text color={surface.muted} w="9.5rem" flexShrink={0} pr={2}>{translate(row.label)}</Text>
          <Box minW={0} flex="1" wordBreak="break-word">{row.value === null || row.value === undefined || row.value === '' ? '-' : row.value}</Box>
        </Flex>
      ))}
    </Stack>
  );
}

/** Initials in a small circle, for staff and contacts. */
export function Initials({ name, color }) {
  const letters = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
  return (
    <Flex w="1.7rem" h="1.7rem" borderRadius="full" bg={(color || 'brand') + '.100'} color={(color || 'brand') + '.700'}
      align="center" justify="center" fontSize="0.65rem" fontWeight="700" flexShrink={0}>
      {letters}
    </Flex>
  );
}

/** Nothing to show yet, inside a card. */
export function Empty360({ children }) {
  const surface = useSurface();
  return <Text fontSize="sm" color={surface.muted} py={2}>{children}</Text>;
}
