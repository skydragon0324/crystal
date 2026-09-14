import React from 'react';
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react';

import { EmptyState, ErrorState, Loading } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { formatPrice, useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The Eshop card.
 *
 * Not a list — one card with four values on it, so it is laid out as the card
 * rather than as a table with one row. The level is the thing a member checks
 * this page for, so it is the largest thing on it.
 *
 * The four values are genuinely different currencies and are labelled as such:
 * `real_value` is money, `prize_value` is money the member did not pay in,
 * `commerce_value` is a trading balance and `accum_value` is lifetime spend
 * that decides the level. Putting them in one row of equal cards would imply
 * they add up. They do not, so the two that are spendable lead and the two
 * that are standing follow.
 */
export default function EshopCard() {
  const t = useT();
  const surface = useSurface();

  const card = useApi(() => api.account.eshopCard(), []);

  if (card.loading) return <Loading variant="list" count={2} height="120px" />;
  if (card.error) return <ErrorState message={card.error} onRetry={card.reload} />;

  const data = card.data || {};

  if (!data.linked) {
    return (
      <EmptyState
        title={t('common.noEshopAccountLinked')}
        hint={t('common.thisCrystalAccountIsNot')}
      />
    );
  }

  if (!data.card) {
    return (
      <EmptyState
        title={t('common.theEshopDidNotAnswer')}
        hint={t('common.yourCardIsStillThere')}
      />
    );
  }

  const info = data.card;

  return (
    <Box>
      {/* The card itself. Level and VIP number are what identify it. */}
      <Box
        p={{ base: 5, md: 7 }}
        borderRadius="18px"
        mb="7"
        bgGradient="linear(to-br, brand.500, brand.700)"
        color="white"
      >
        <Flex justify="space-between" align="flex-start" gap="4" data-gap="16" data-gap-wrap wrap="wrap">
          <Box>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" opacity={0.85}>
              {t('common.crystalEshopCard')}
            </Text>
            <Text fontSize="3xl" fontWeight="800" letterSpacing="-0.02em" lineHeight="1.1">
              {t('common.level')} {info.card_level}
            </Text>
            {/*
              * TWO NUMBERS, BECAUSE THERE ARE TWO CARDS.
              *
              * The vendor issued them separately — a wallet card with the VIP
              * number on it and an accumulation card with the customer number
              * — and a member ringing the shop is asked for one or the other.
              * Showing only the VIP number meant the page could not answer
              * half the questions it exists to answer.
              */}
            <Text fontSize="sm" opacity={0.9} fontFamily="mono" mt="1">
              {info.vip_no}
            </Text>
            {!!info.customer_no && (
              <Text fontSize="xs" opacity={0.75} fontFamily="mono">
                {t('common.customerNo')} {info.customer_no}
              </Text>
            )}
          </Box>
          <Box textAlign={{ base: 'left', sm: 'right' }}>
            <Text fontSize="xs" opacity={0.85}>{t('common.spendable')}</Text>
            <Text fontSize="2xl" fontWeight="800" letterSpacing="-0.02em">
              {formatPrice(info.real_value)}
            </Text>
          </Box>
        </Flex>
      </Box>

      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="3">
        <Value label={t('common.balance')} value={formatPrice(info.real_value)} note={t('common.yoursToSpend')} />
        <Value label={t('common.prizeBalance')} value={formatPrice(info.prize_value)} note={t('common.wonNotPaidIn')} />
        <Value label={t('common.commerceValue')} value={Number(info.commerce_value).toLocaleString()} note={t('common.tradingBalance')} />
        <Value label={t('common.accumulated')} value={Number(info.accum_value).toLocaleString()} note={t('common.decidesYourLevel')} />
      </SimpleGrid>

      <Text fontSize="sm" color={surface.muted} mt="5">
        {t('common.theseFourAreSeparateBalances')}
      </Text>
    </Box>
  );
}

function Value({ label, value, note }) {
  const surface = useSurface();

  return (
    <Box p="4" borderRadius="14px" bg={surface.raised}>
      <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.5px">
        {label}
      </Text>
      <Text fontSize="xl" fontWeight="800" color={surface.text} letterSpacing="-0.02em">
        {value}
      </Text>
      <Text fontSize="xs" color={surface.muted}>{note}</Text>
    </Box>
  );
}
