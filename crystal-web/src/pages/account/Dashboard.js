import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  useColorModeValue
} from '@chakra-ui/react';
import {
  FiAlertCircle,
  FiArrowRight,
  FiBarChart2,
  FiClipboard,
  FiGrid,
  FiZap
} from 'react-icons/fi';

import { ErrorState } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate, money, number } from '@/utils/format';

/**
 * THE MEMBER DASHBOARD: FOUR FIGURES, AND WHO THE MEMBER IS.
 *
 * It used to be everything at once - nine balances from four systems, a merged
 * timeline, devices, repairs and two shortcuts - and the member asked for four
 * cards and their details instead. So that is the whole page:
 *
 *   COMMERCE   the Eshop card's commerce value
 *   SOFTWARE   Appstore + Karaoke + Media + Minus
 *   REGISTER   phone registration points + eproduct registration points
 *   ACTIVITY   the activity point stats
 *
 * and under them the platform's record of the person. Every figure is summed on
 * the server (services/member.service.js says from which rows), and each card
 * carries the one line that says what it adds up, the parts it was added from,
 * and a way to the list of rows behind it.
 *
 * A PART OF THE PAGE THAT DID NOT LOAD IS SAID TO HAVE NOT LOADED, and the rest
 * stays. The server builds each card on its own and marks the one it could not
 * read; a reload that fails keeps what was already on screen. Only a first load
 * with nothing to show is the full-page error.
 */

/** What each card is called, what it adds up, and how it is drawn. */
const CARDS = {
  COMMERCE: {
    label: 'account.dashboard.commerceValue',
    explained: 'account.dashboard.commerceValueExplained',
    icon: FiBarChart2,
    tone: 'purple.400'
  },
  SOFTWARE: {
    label: 'account.dashboard.softwarePoints',
    explained: 'account.dashboard.softwarePointsExplained',
    icon: FiGrid,
    tone: 'teal.400'
  },
  REGISTER: {
    label: 'account.dashboard.registerPoints',
    explained: 'account.dashboard.registerPointsExplained',
    icon: FiClipboard,
    tone: 'orange.400'
  },
  ACTIVITY: {
    label: 'account.dashboard.activityPoints',
    explained: 'account.dashboard.activityPointsExplained',
    icon: FiZap,
    tone: 'brand.500'
  }
};

/*
 * THE PARTS, BY CARD - the same key means different things on two cards.
 * MINUS on the software card is the Minus ledger; on the activity card it is
 * what the stats row records as taken back. Keyed by card so neither borrows
 * the other's words.
 */
const PARTS = {
  SOFTWARE: {
    APPSTORE: 'account.dashboard.partAppstore',
    KARAOKE: 'account.dashboard.partKaraoke',
    MEDIA: 'account.dashboard.partMedia',
    MINUS: 'account.dashboard.partMinus'
  },
  REGISTER: {
    PHONE: 'account.dashboard.partPhone',
    EPRODUCT: 'account.dashboard.partEproduct'
  },
  ACTIVITY: {
    LIMIT: 'account.dashboard.partLimit',
    MINUS: 'account.dashboard.partDeducted'
  }
};

const GENDERS = {
  M: 'account.dashboard.male',
  F: 'account.dashboard.female'
};

/** Nothing to show - the same em dash utils/format writes for an empty date. */
const DASH = '—';

/**
 * A figure in its unit, or a dash for one that is not known.
 *
 * NULL IS NOT ZERO. A card the server could not read comes back with no value,
 * and drawing that as 0 would tell the member they have nothing.
 */
function figure(value, unit) {
  if (value === null || value === undefined) return DASH;
  return unit === 'money' ? money(value) : number(value);
}

export default function Dashboard() {
  const t = useT();
  const surface = useSurface();
  const dashboard = useApi(() => api.account.dashboard(), []);

  const data = dashboard.data;

  /* A first load: nothing on screen yet, so the page is its own shape in grey. */
  if (!data && dashboard.loading) return <DashboardSkeleton />;
  if (!data) return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;

  const cards = data.cards || [];
  const member = data.member || { state: 'UNAVAILABLE' };

  /*
   * WHAT DID NOT LOAD, AND WHETHER TO SAY SO. A reload that failed keeps the
   * figures it had, with the error above them; a part the server could not
   * reach is named on its card and summed up here, with a way to try again.
   */
  const partial = cards.some((card) => card.state === 'UNAVAILABLE'
    || (card.parts || []).some((part) => part.state === 'UNAVAILABLE'))
    || member.state === 'UNAVAILABLE';

  return (
    <Stack spacing="8">
      {(dashboard.error || partial) && (
        <Flex
          role="alert"
          align="center"
          justify="space-between"
          wrap="wrap"
          gap="3"
          data-gap="12"
          data-gap-wrap
          px="4"
          py="3"
          borderRadius="12px"
          borderWidth="1px"
          borderColor="red.300"
        >
          <Flex align="center" gap="2" data-gap="8" minW="0">
            <Icon as={FiAlertCircle} boxSize="4" color="red.400" flexShrink={0} />
            <Text fontSize="sm" color={surface.text}>
              {dashboard.error || t('account.dashboard.someOfThisDidNotLoad')}
            </Text>
          </Flex>
          <Button size="sm" variant="quiet" onClick={dashboard.reload} isLoading={dashboard.loading}>
            {t('common.tryAgain')}
          </Button>
        </Flex>
      )}

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing="4">
        {cards.filter((card) => CARDS[card.key]).map((card) => (
          <FigureCard key={card.key} card={card} />
        ))}
      </SimpleGrid>

      <MemberDetails member={member} />
    </Stack>
  );
}

/**
 * ONE FIGURE: what it is, the number, what it adds up, the parts it was added
 * from, and the way to the rows.
 *
 * NOT ONE BIG LINK. The parts on the software card each go to their own ledger,
 * and a link inside a link is neither valid nor clickable where the reader
 * expects - so the card is a panel, and its own way in is the line at the foot.
 */
function FigureCard({ card }) {
  const t = useT();
  const surface = useSurface();
  const shape = CARDS[card.key];
  const words = PARTS[card.key] || {};

  const parts = (card.parts || []).filter((part) => words[part.key]);

  return (
    <Flex
      as="section"
      aria-label={t(shape.label)}
      data-card={card.key}
      direction="column"
      p="5"
      borderRadius="16px"
      bg={surface.card}
      borderWidth="1px"
      borderColor={card.state === 'UNAVAILABLE' ? 'red.300' : surface.border}
      boxShadow={surface.shadow}
    >
      <Flex align="center" gap="2" data-gap="8">
        <Icon as={shape.icon} boxSize="4" color={shape.tone} flexShrink={0} />
        <Heading
          as="h2"
          fontSize="xs"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing="0.5px"
          color={surface.muted}
          noOfLines={1}
        >
          {t(shape.label)}
        </Heading>
      </Flex>

      <Text
        data-figure
        mt="2"
        fontSize="3xl"
        fontWeight="800"
        letterSpacing="-0.02em"
        lineHeight="1.1"
        color={card.value < 0 ? 'red.400' : surface.text}
        wordBreak="break-all"
      >
        {figure(card.value, card.unit)}
      </Text>

      <Text mt="2" fontSize="sm" color={surface.muted}>{t(shape.explained)}</Text>

      {card.state === 'UNLINKED' && (
        <Text mt="2" fontSize="sm" color={surface.strong}>{t('account.dashboard.noEshopAccount')}</Text>
      )}
      {card.state === 'UNAVAILABLE' && (
        <Text mt="2" fontSize="sm" color="red.400">{t('account.dashboard.couldNotLoad')}</Text>
      )}

      {parts.length > 0 && (
        <Stack spacing="1" mt="4" pt="3" borderTopWidth="1px" borderColor={surface.border}>
          {parts.map((part) => (
            <PartRow key={part.key} label={t(words[part.key])} part={part} unit={card.unit} />
          ))}
        </Stack>
      )}

      {/* The foot sits at the bottom whatever the card above it holds, so a row of four lines up. */}
      <Box flex="1" />

      {card.to && (
        <Flex
          as={RouterLink}
          to={card.to}
          align="center"
          gap="1"
          data-gap="4"
          mt="4"
          alignSelf="flex-start"
          fontSize="sm"
          fontWeight="600"
          color="brand.500"
          _hover={{ textDecoration: 'underline' }}
        >
          {t('account.dashboard.seeTheRows')}
          <Icon as={FiArrowRight} boxSize="3.5" />
        </Flex>
      )}
    </Flex>
  );
}

/**
 * One part of a figure. A link when there is a page listing its rows, plain
 * text when there is not - register_point_log has no page on the site, and a
 * link that went nowhere useful would be worse than none.
 */
function PartRow({ label, part, unit }) {
  const t = useT();
  const surface = useSurface();

  const value = part.state === 'UNLINKED'
    ? t('account.dashboard.noAccount')
    : figure(part.value, unit);

  const linked = !!part.to;

  return (
    <Flex
      as={linked ? RouterLink : 'div'}
      to={linked ? part.to : undefined}
      data-part={part.key}
      align="baseline"
      justify="space-between"
      gap="3"
      data-gap="12"
      py="0.5"
      borderRadius="6px"
      _hover={linked ? { color: 'brand.500' } : undefined}
    >
      <Text fontSize="sm" color={linked ? 'inherit' : surface.muted} noOfLines={1}>{label}</Text>
      <Text
        fontSize="sm"
        fontWeight="600"
        whiteSpace="nowrap"
        color={part.state === 'UNAVAILABLE' ? 'red.400' : part.value < 0 ? 'red.400' : surface.text}
      >
        {value}
      </Text>
    </Flex>
  );
}

/**
 * WHO THE MEMBER IS, as the platform records it.
 *
 * Every field that is missing is a dash rather than a blank or a word like
 * "unknown": a blank reads as the page not having finished, and a word would
 * need translating into a claim the data does not make.
 */
function MemberDetails({ member }) {
  const t = useT();
  const surface = useSurface();

  const phones = member.phones || [];

  return (
    <Box
      as="section"
      aria-labelledby="dashboard-details"
      data-details
      p="5"
      borderRadius="16px"
      bg={surface.card}
      borderWidth="1px"
      borderColor={member.state === 'UNAVAILABLE' ? 'red.300' : surface.border}
      boxShadow={surface.shadow}
    >
      <Heading id="dashboard-details" as="h2" size="sm" color={surface.text}>
        {t('account.dashboard.yourDetails')}
      </Heading>
      <Text mt="1" fontSize="sm" color={surface.muted}>{t('account.dashboard.yourDetailsExplained')}</Text>

      {member.state === 'UNAVAILABLE' ? (
        <Text mt="4" fontSize="sm" color="red.400">{t('account.dashboard.detailsCouldNotLoad')}</Text>
      ) : (
        <SimpleGrid as="dl" columns={{ base: 2, lg: 5 }} spacing="5" mt="5">
          <Detail label={t('account.dashboard.userId')} mono>{member.user_id}</Detail>
          <Detail label={t('account.dashboard.userName')}>{member.user_name}</Detail>
          <Detail label={t('account.dashboard.gender')}>
            {GENDERS[member.gender] ? t(GENDERS[member.gender]) : null}
          </Detail>
          <Detail label={t('account.dashboard.birthday')}>
            {member.birthday ? formatDate(member.birthday) : null}
          </Detail>
          <Detail label={t('account.dashboard.phoneNumbers')} mono>
            {phones.length ? (
              /* Several are allowed, and each is a number somebody may dial - one to a line. */
              <Stack as="ul" spacing="0.5" listStyleType="none" m="0">
                {phones.map((phone) => <Box as="li" key={phone}>{phone}</Box>)}
              </Stack>
            ) : null}
          </Detail>
        </SimpleGrid>
      )}
    </Box>
  );
}

function Detail({ label, children, mono }) {
  const surface = useSurface();
  const empty = children === null || children === undefined || children === '';

  return (
    <Box data-detail minW="0">
      <Text
        as="dt"
        fontSize="xs"
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing="0.5px"
        color={surface.muted}
      >
        {label}
      </Text>
      <Box
        as="dd"
        m="0"
        mt="1"
        fontWeight="600"
        color={empty ? surface.muted : surface.text}
        fontFamily={mono && !empty ? 'mono' : undefined}
        wordBreak="break-word"
      >
        {empty ? DASH : children}
      </Box>
    </Box>
  );
}

/**
 * THE PAGE'S OWN SHAPE IN GREY: four cards with a title, a figure, a line and
 * the parts' rows, then the details panel's five fields - so nothing moves when
 * the figures land.
 */
const SKELETON_PARTS = [0, 4, 2, 2];

function DashboardSkeleton() {
  const surface = useSurface();
  const line = useColorModeValue('ink.100', 'ink.600');

  return (
    <Stack spacing="8" aria-busy="true" data-skeleton>
      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing="4">
        {SKELETON_PARTS.map((count, index) => (
          <Box
            key={index}
            data-skeleton-card
            p="5"
            borderRadius="16px"
            borderWidth="1px"
            borderColor={surface.border}
          >
            <Skeleton height="12px" width="45%" />
            <Skeleton height="32px" width="60%" mt="3" />
            <Skeleton height="12px" width="90%" mt="3" />
            {count > 0 && (
              <Stack spacing="2" mt="4" pt="3" borderTopWidth="1px" borderColor={line}>
                {Array.from({ length: count }).map((ignored, row) => (
                  <Skeleton key={row} height="12px" />
                ))}
              </Stack>
            )}
            <Skeleton height="12px" width="35%" mt="5" />
          </Box>
        ))}
      </SimpleGrid>

      <Box p="5" borderRadius="16px" borderWidth="1px" borderColor={surface.border}>
        <Skeleton height="16px" width="160px" />
        <SimpleGrid columns={{ base: 2, lg: 5 }} spacing="5" mt="5">
          {[0, 1, 2, 3, 4].map((index) => (
            <Box key={index}>
              <Skeleton height="10px" width="50%" />
              <Skeleton height="16px" width="80%" mt="2" />
            </Box>
          ))}
        </SimpleGrid>
      </Box>
    </Stack>
  );
}
