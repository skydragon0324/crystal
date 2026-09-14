import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Stack,
  Text
} from '@chakra-ui/react';
import {
  FiCheckSquare,
  FiKey,
  FiLifeBuoy,
  FiSettings,
  FiShoppingBag,
  FiSmartphone,
  FiZap
} from 'react-icons/fi';

import { EmptyState, ErrorState, Loading, StatusBadge } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { formatPrice, useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * THE MEMBER DASHBOARD — and the question it is built to answer is one no
 * screen in either project could answer before: WHERE DOES THIS PERSON STAND,
 * across everything Crystal knows about them?
 *
 * They exist in four systems. Crystal holds their devices, repairs and points;
 * the vendor's platform holds five more point ledgers; the Eshop holds a card
 * with money on it; the Appstore holds coins. That is nine balances in four
 * places, and until this page every one of them lived on a different screen -
 * the vendor's console reached them through eight menu entries and never put
 * two side by side.
 *
 * So the page is two ideas, in this order:
 *
 *   WHERE YOU STAND   every balance, at once, denominated. Not summed - points,
 *                     coins and money are three different things and a column
 *                     of bare numbers invites adding them up.
 *
 *   WHAT HAPPENED     one timeline, merging point movements, Eshop orders and
 *                     Appstore purchases into the order they actually occurred.
 *                     Each system could only ever show its own half of a week;
 *                     this is the week.
 *
 * Then the things that need doing - devices and open repairs - which is the
 * part that was already right and is left alone.
 *
 * Everything arrives in ONE call. Nine balances from four systems as nine
 * requests would be nine spinners resolving at nine different moments, and two
 * of those systems are remote. The server gathers them, and a source it cannot
 * reach is simply absent rather than fatal.
 */

/** What a balance is counted in decides how it is written. */
function denominate(value, unit) {
  if (unit === 'money') return formatPrice(value);
  return Number(value).toLocaleString();
}

/** The colour a system is recognised by, used on both the strip and the rail. */
const GROUP_TONE = {
  POINTS: 'brand.500',
  ESHOP: 'purple.400',
  APPSTORE: 'teal.400'
};

const KIND_ICON = {
  POINTS: FiZap,
  ORDER: FiShoppingBag,
  PURCHASE: FiKey
};

const KIND_TONE = {
  POINTS: 'brand.500',
  ORDER: 'purple.400',
  PURCHASE: 'teal.400'
};

export default function Dashboard() {
  const t = useT();

  const surface = useSurface();
  const dashboard = useApi(() => api.account.dashboard(), []);

  if (dashboard.loading) return <Loading variant="list" count={4} height="120px" />;
  if (dashboard.error) {
    return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;
  }

  const data = dashboard.data || {};
  const standing = data.standing || [];
  const stream = data.stream || [];
  const counters = data.counters || {};

  return (
    <Stack spacing="10">
      {/* ------------------------------------------------ where you stand */}
      <Box>
        <Flex align="baseline" justify="space-between" gap="3" data-gap="12" data-gap-wrap mb="4" wrap="wrap">
          <Heading size="md" color={surface.text}>{t('account.dashboard.whereYouStand')}</Heading>
          <Text fontSize="sm" color={surface.muted}>
            {t('account.dashboard.balancesAcrossFourSystemsThey', {
              count: standing.length
            })}
          </Text>
        </Flex>

        {standing.length === 0 ? (
          <EmptyState
            title={t('account.dashboard.nothingToShowYet')}
            hint={t('account.dashboard.balancesAppearHereAsYou')}
          />
        ) : (
          <SimpleGrid columns={{ base: 2, md: 3, xl: 5 }} spacing="3">
            {standing.map((balance) => (
              <Box
                key={balance.key}
                as={RouterLink}
                to={balance.to}
                p="4"
                borderRadius="14px"
                bg={surface.raised}
                borderWidth="1px"
                borderColor="transparent"
                transition="border-color 160ms ease"
                _hover={{ borderColor: GROUP_TONE[balance.group] || 'brand.500' }}
              >
                {/* The system's colour is the only thing distinguishing an
                    Eshop balance from a point balance at a glance. */}
                <Flex align="center" gap="2" data-gap="8" mb="1">
                  <Box
                    w="6px"
                    h="6px"
                    borderRadius="full"
                    bg={GROUP_TONE[balance.group] || 'brand.500'}
                    flexShrink={0}
                  />
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    textTransform="uppercase"
                    letterSpacing="0.5px"
                    color={surface.muted}
                    noOfLines={1}
                  >
                    {balance.label}
                  </Text>
                </Flex>

                <Text fontSize="xl" fontWeight="800" color={surface.text} letterSpacing="-0.02em">
                  {denominate(balance.value, balance.unit)}
                </Text>

                <Text fontSize="xs" color={surface.muted}>
                  {balance.cap
                    ? `${t('common.of')} ${Number(balance.cap).toLocaleString()} ${t(balance.unit)}`
                    : t(balance.unit)}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        )}
      </Box>

      {/* -------------------------------------------------- what happened */}
      <Box>
        <Flex align="baseline" justify="space-between" gap="3" data-gap="12" data-gap-wrap mb="4" wrap="wrap">
          <Heading size="md" color={surface.text}>{t('common.whatHappened')}</Heading>
          <Text fontSize="sm" color={surface.muted}>
            {t('account.dashboard.pointsOrdersAndPurchasesIn')}
          </Text>
        </Flex>

        {stream.length === 0 ? (
          <EmptyState title={t('account.dashboard.nothingYet')} hint={t('account.dashboard.yourActivityAcrossAllFour')} />
        ) : (
          <Box position="relative">
            {/*
              * A CONTINUOUS RAIL down the left, with each event hanging off it.
              *
              * The rail is what makes six sources read as one week rather than
              * as six lists that happen to be stacked - it is drawn once behind
              * the rows instead of per row, so it does not break between them.
              */}
            <Box
              position="absolute"
              left="7px"
              top="14px"
              bottom="14px"
              w="2px"
              bg={surface.border}
              aria-hidden="true"
            />

            <Stack spacing="0">
              {stream.map((event, index) => (
                <Flex
                  key={index}
                  as={RouterLink}
                  to={event.to}
                  align="flex-start"
                  gap="4"
                  data-gap="16"
                  py="3"
                  pl="0"
                  position="relative"
                  borderRadius="10px"
                  transition="background 140ms ease"
                  _hover={{ bg: surface.raised, textDecoration: 'none' }}
                >
                  <Flex
                    align="center"
                    justify="center"
                    boxSize="16px"
                    borderRadius="full"
                    bg={surface.page}
                    borderWidth="2px"
                    borderColor={KIND_TONE[event.kind] || 'brand.500'}
                    mt="1"
                    flexShrink={0}
                    zIndex={1}
                  />

                  <Box flex="1" minW="0">
                    <Flex align="baseline" gap="2" data-gap="8" data-gap-wrap wrap="wrap">
                      <Text fontWeight="600" color={surface.text} noOfLines={1}>
                        {event.title || t('common.adjustment')}
                      </Text>
                      <Flex align="center" gap="1" data-gap="4">
                        <Icon
                          as={KIND_ICON[event.kind] || FiZap}
                          boxSize="3"
                          color={KIND_TONE[event.kind] || 'brand.500'}
                        />
                        <Text fontSize="xs" color={surface.muted}>{event.source}</Text>
                      </Flex>
                    </Flex>
                    <Text fontSize="xs" color={surface.muted}>
                      {formatDate(event.at)}
                    </Text>
                  </Box>

                  <Text
                    fontWeight="700"
                    whiteSpace="nowrap"
                    color={event.amount < 0 ? 'red.400' : 'green.500'}
                  >
                    {event.amount > 0 ? '+' : ''}
                    {denominate(event.amount, event.unit)}
                  </Text>
                </Flex>
              ))}
            </Stack>
          </Box>
        )}
      </Box>

      {/* --------------------------------------------------- your devices */}
      <Box>
        <Flex align="baseline" justify="space-between" gap="3" data-gap="12" data-gap-wrap mb="4" wrap="wrap">
          <Heading size="md" color={surface.text}>{t('account.dashboard.yourDevices')}</Heading>
          <Text fontSize="sm" color={surface.muted}>
            {t('account.dashboard.registeredLicencesRepairsOpen', {
              devices: counters.device_cnt || 0,
              licenses: counters.license_cnt || 0,
              repairs: counters.open_repair_cnt || 0
            })}
          </Text>
        </Flex>

        {(data.devices || []).length === 0 ? (
          <EmptyState
            title={t('account.dashboard.noDevicesRegistered')}
            hint={t('account.dashboard.registeringADeviceEarns500')}
            actionLabel={t('common.registerAProduct')}
            actionTo="/account/products/register"
          />
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing="3">
            {data.devices.map((device) => (
              <Flex
                key={device.id}
                as={RouterLink}
                to="/account/products"
                align="center"
                gap="3"
                data-gap="12"
                p="4"
                borderRadius="14px"
                borderWidth="1px"
                borderColor={surface.border}
                _hover={{ borderColor: 'brand.500', textDecoration: 'none' }}
              >
                <Icon as={FiSmartphone} boxSize="5" color="brand.500" flexShrink={0} />
                <Box minW="0">
                  <Text fontWeight="600" color={surface.text} noOfLines={1}>
                    {device.nickname || device.product_name || device.serial_number}
                  </Text>
                  <Text fontSize="xs" color={surface.muted} fontFamily="mono" noOfLines={1}>
                    {device.serial_number}
                  </Text>
                </Box>
              </Flex>
            ))}
          </SimpleGrid>
        )}
      </Box>

      {/* --------------------------------------------------- open repairs */}
      {(data.repairs || []).length > 0 && (
        <Box>
          <Heading size="md" color={surface.text} mb="4">{t('account.dashboard.repairsInProgress')}</Heading>
          <Stack spacing="3">
            {data.repairs.map((ticket) => (
              <Flex
                key={ticket.id}
                as={RouterLink}
                to="/account/repairs"
                align="center"
                justify="space-between"
                gap="3"
                data-gap="12"
                p="4"
                borderRadius="14px"
                borderWidth="1px"
                borderColor={surface.border}
                _hover={{ borderColor: 'brand.500', textDecoration: 'none' }}
              >
                <Flex align="center" gap="3" data-gap="12" minW="0">
                  <Icon as={FiSettings} boxSize="5" color="orange.400" flexShrink={0} />
                  <Box minW="0">
                    <Text fontWeight="600" color={surface.text} noOfLines={1}>
                      {ticket.ticket_no}
                    </Text>
                    <Text fontSize="xs" color={surface.muted} noOfLines={1}>
                      {ticket.product_name || ticket.symptom || ''}
                    </Text>
                  </Box>
                </Flex>
                <StatusBadge value={ticket.status_label || ticket.status} />
              </Flex>
            ))}
          </Stack>
        </Box>
      )}

      {/* A quiet way into the two things a member most often comes here for. */}
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing="3">
        <Shortcut to="/account/products/register" icon={FiCheckSquare} label={t('common.registerAProduct')} hint={t('account.dashboard.earn500PointsAndStart')} />
        <Shortcut to="/account/feedback" icon={FiLifeBuoy} label={t('account.dashboard.askSupport')} hint={t('account.dashboard.openAConversationWithThe')} />
      </SimpleGrid>
    </Stack>
  );
}

function Shortcut({ to, icon, label, hint }) {
  const surface = useSurface();

  return (
    <Flex
      as={RouterLink}
      to={to}
      align="center"
      gap="3"
      data-gap="12"
      p="4"
      borderRadius="14px"
      bg={surface.raised}
      _hover={{ textDecoration: 'none', bg: surface.hover }}
    >
      <Icon as={icon} boxSize="5" color="brand.500" flexShrink={0} />
      <Box>
        <Text fontWeight="600" color={surface.text}>{label}</Text>
        <Text fontSize="xs" color={surface.muted}>{hint}</Text>
      </Box>
    </Flex>
  );
}
