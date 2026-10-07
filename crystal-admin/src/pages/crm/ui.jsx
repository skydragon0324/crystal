import React from 'react';
import {
  Avatar, Badge, Box, Flex, HStack, Icon, Progress, SimpleGrid, Stack, Tag, Text, Wrap, WrapItem,
  useColorModeValue
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import { useT } from '../../i18n';
import { useSurface } from '../../theme/tokens';
import { dateTime, money, number } from '../../utils/format';
import { word } from './shared';

/**
 * THE CRM'S VISUAL VOCABULARY - what a grade, a score, a project or a moment
 * in a customer's history looks like, drawn the same way on every screen.
 *
 * A grade is the Dream-wide corporate grade (AAA..C), never a project tier;
 * it has one colour per band so a list of customers reads at a glance. The
 * score is 0-100 and always shown with its bar. Projects are tags because a
 * customer usually has several.
 */

const GRADE_COLOUR = { AAA: 'purple', AA: 'blue', A: 'teal', B: 'orange', C: 'gray' };

export function GradeBadge({ code, size }) {
  const translate = useT();
  if (!code) return <Text as="span" fontSize="xs" color="gray.500">{translate('crm.ui.notGraded')}</Text>;
  const big = size === 'lg';
  return (
    <Badge
      colorScheme={GRADE_COLOUR[code] || 'gray'}
      variant={big ? 'solid' : 'subtle'}
      fontSize={big ? '1.1rem' : '0.7rem'}
      px={big ? 3 : 2}
      py={big ? 1 : '2px'}
      borderRadius="md"
      letterSpacing="0.04em"
    >
      {code}
    </Badge>
  );
}

/** A 0-100 score with its bar. */
export function ScoreMeter({ value, compact }) {
  if (value === null || value === undefined) return <Text as="span" fontSize="xs" color="gray.500">-</Text>;
  const score = Number(value);
  const scheme = score >= 80 ? 'purple' : (score >= 60 ? 'blue' : (score >= 40 ? 'teal' : (score >= 20 ? 'orange' : 'gray')));
  return (
    <Box minW={compact ? '5rem' : '7rem'}>
      <Flex justify="space-between" align="baseline">
        <Text fontSize={compact ? 'xs' : 'sm'} fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>{number(score, 1)}</Text>
        {compact ? null : <Text fontSize="0.65rem" color="gray.500">/ 100</Text>}
      </Flex>
      <Progress value={score} size="xs" borderRadius="full" colorScheme={scheme} mt="2px" />
    </Box>
  );
}

const PROJECT_COLOUR = { CRYSTAL: 'blue', ESHOP: 'orange', APPSTORE: 'purple', PLATFORM: 'gray', EPRODUCT: 'teal', KARAOKE: 'pink', BMEDIA: 'cyan' };

export function ProjectTags({ codes, size }) {
  const list = (Array.isArray(codes) ? codes : String(codes || '').split(',')).filter(Boolean);
  if (!list.length) return <Text as="span" fontSize="xs" color="gray.500">-</Text>;
  return (
    <Wrap spacing={1}>
      {list.map((code) => (
        <WrapItem key={code}>
          <Tag size={size || 'sm'} colorScheme={PROJECT_COLOUR[code] || 'gray'} variant="subtle" borderRadius="full">{code}</Tag>
        </WrapItem>
      ))}
    </Wrap>
  );
}

/** A party's face: their initials, coloured by type. */
export function PartyAvatar({ name, type, size }) {
  return (
    <Avatar
      name={name || '?'}
      size={size || 'md'}
      bg={type === 'ORGANIZATION' ? 'teal.500' : 'brand.500'}
      color="white"
      icon={type === 'ORGANIZATION' ? <Icon as={Md.MdBusiness} /> : undefined}
    />
  );
}

/** A small labelled figure - denser than a StatTile, for a strip of eight. */
export function Kpi({ label, value, hint, tone }) {
  const translate = useT();
  const surface = useSurface();
  const colour = { good: 'green.500', bad: 'red.500', warn: 'orange.500' }[tone] || surface.text;
  return (
    <Box borderWidth="1px" borderColor={surface.border} borderRadius="lg" px={3} py={2.5} bg={surface.card} minW={0}>
      <Text fontSize="0.66rem" color={surface.muted} textTransform="uppercase" letterSpacing="0.05em" noOfLines={1}>{translate(label)}</Text>
      <Text fontSize="lg" fontWeight="700" color={colour} mt="2px" noOfLines={1} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value === null || value === undefined || value === '' ? '-' : value}
      </Text>
      {hint ? <Text fontSize="xs" color={surface.muted} noOfLines={1}>{hint}</Text> : null}
    </Box>
  );
}

export function KpiStrip({ children }) {
  return <SimpleGrid columns={{ base: 2, md: 4, xl: 8 }} spacing={3}>{children}</SimpleGrid>;
}

/** A titled block on a record screen, lighter than a Card. */
export function Panel({ title, action, children, empty }) {
  const surface = useSurface();
  const translate = useT();
  return (
    <Box borderWidth="1px" borderColor={surface.border} borderRadius="lg" bg={surface.card} overflow="hidden">
      {title || action ? (
        <Flex px={4} py={2.5} align="center" justify="space-between" borderBottomWidth="1px" borderColor={surface.border}>
          {typeof title === 'string' ? <Text fontSize="sm" fontWeight="600">{title}</Text> : <Box fontSize="sm" fontWeight="600">{title}</Box>}
          {action}
        </Flex>
      ) : null}
      <Box p={empty ? 4 : 0}>
        {empty ? <Text fontSize="sm" color={surface.muted}>{translate(empty)}</Text> : children}
      </Box>
    </Box>
  );
}

/** label: value lines inside a panel. */
export function InfoList({ items }) {
  const surface = useSurface();
  const translate = useT();
  return (
    <Stack spacing={0} divider={<Box borderBottomWidth="1px" borderColor={surface.border} />}>
      {items.filter(Boolean).map((item) => (
        <Flex key={item.label} px={4} py={2} justify="space-between" align="center" fontSize="sm">
          <Text color={surface.muted} mr={3}>{translate(item.label)}</Text>
          <Box textAlign="right" minW={0} wordBreak="break-word">
            {item.value === null || item.value === undefined || item.value === '' ? '-' : item.value}
          </Box>
        </Flex>
      ))}
    </Stack>
  );
}

const TIMELINE_ICON = {
  TRANSACTION: Md.MdShoppingCart, REFUND: Md.MdUndo, CASE: Md.MdBuild, REGISTRATION: Md.MdDevices,
  VISIT: Md.MdPlace, POINTS: Md.MdStars, TIER: Md.MdTrendingUp, ENTRY: Md.MdConfirmationNumber
};
const TIMELINE_COLOUR = {
  TRANSACTION: 'blue.500', REFUND: 'red.400', CASE: 'orange.400', REGISTRATION: 'teal.500',
  VISIT: 'purple.400', POINTS: 'yellow.500', TIER: 'green.500', ENTRY: 'pink.400'
};

/** What happened to a customer, newest first, across every kind of record. */
export function Timeline({ items, onOpen }) {
  const surface = useSurface();
  const line = useColorModeValue('gray.200', 'whiteAlpha.200');
  const translate = useT();
  if (!items.length) return <Text fontSize="sm" color={surface.muted} p={4}>{translate('crm.ui.nothingYet')}</Text>;
  return (
    <Stack spacing={0} px={4} py={3}>
      {items.map((item, index) => (
        <Flex key={item.kind + ':' + item.id} position="relative" pb={index === items.length - 1 ? 0 : 4}>
          {index === items.length - 1 ? null : (
            <Box position="absolute" left="0.85rem" top="1.9rem" bottom="0" w="2px" bg={line} />
          )}
          <Flex
            w="1.75rem" h="1.75rem" borderRadius="full" bg={surface.card} borderWidth="2px"
            borderColor={TIMELINE_COLOUR[item.kind] || 'gray.400'} align="center" justify="center" flexShrink={0} mr={3}
          >
            <Icon as={TIMELINE_ICON[item.kind] || Md.MdEvent} color={TIMELINE_COLOUR[item.kind] || 'gray.400'} boxSize="0.9rem" />
          </Flex>
          <Box flex="1" minW={0} cursor={onOpen && item.open ? 'pointer' : 'default'} onClick={() => onOpen && item.open && onOpen(item.open)}>
            <HStack justify="space-between" align="baseline">
              <Text fontSize="sm" fontWeight="500" noOfLines={1}>{item.title}</Text>
              <Text fontSize="xs" color={surface.muted} flexShrink={0} ml={2}>{dateTime(item.at)}</Text>
            </HStack>
            {item.detail ? <Text fontSize="xs" color={surface.muted} noOfLines={2}>{item.detail}</Text> : null}
          </Box>
        </Flex>
      ))}
    </Stack>
  );
}

/** The six parts of a corporate score, each against its weight. */
export function ScoreBreakdown({ components, model }) {
  const translate = useT();
  const surface = useSurface();
  const parts = (model && model.parts) || {};
  const keys = ['value', 'frequency', 'recency', 'breadth', 'ownership', 'care'];
  const label = {
    value: 'Spend, 12 months', frequency: 'Purchase days, 12 months', recency: 'How recently',
    breadth: 'Projects active in', ownership: 'Products held', care: 'Complaints'
  };
  if (!components) return <Text fontSize="sm" color={surface.muted} p={4}>{translate('crm.ui.notGradedYet')}</Text>;
  return (
    <Stack spacing={2.5} px={4} py={3}>
      {keys.map((key) => {
        const weight = parts[key] ? parts[key].weight : ({ value: 40, frequency: 15, recency: 15, breadth: 15, ownership: 10, care: 5 })[key];
        const got = Number(components[key] || 0);
        return (
          <Box key={key}>
            <Flex justify="space-between" fontSize="xs">
              <Text color={surface.muted}>{translate(label[key])}</Text>
              <Text fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>{number(got, 1) + ' / ' + weight}</Text>
            </Flex>
            <Progress value={weight ? (got / weight) * 100 : 0} size="xs" borderRadius="full" colorScheme="brand" mt="2px" />
          </Box>
        );
      })}
    </Stack>
  );
}

/** Money in the reporting currency, or as it was paid. */
export function Amount({ value, currency, sign }) {
  if (value === null || value === undefined) return <Text as="span">-</Text>;
  const numeric = Number(value);
  return (
    <Text as="span" color={sign && numeric < 0 ? 'red.500' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {money(numeric, currency)}
    </Text>
  );
}

/** A status word as a coloured dot and the word - quieter than a badge, for dense tables. */
export function Dot({ value }) {
  const translate = useT();
  const colour = {
    ACTIVE: 'green.400', NEW: 'blue.400', AT_RISK: 'orange.400', LAPSED: 'red.400', NEVER_BOUGHT: 'gray.400'
  }[value] || 'gray.400';
  return (
    <HStack spacing={1.5}>
      <Box w="0.5rem" h="0.5rem" borderRadius="full" bg={colour} />
      <Text as="span" fontSize="sm">{word(translate, value)}</Text>
    </HStack>
  );
}
