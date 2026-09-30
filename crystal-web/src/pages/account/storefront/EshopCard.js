import React from 'react';
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react';

import { EmptyState, ErrorState, Loading } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import { formatPrice, MONEY_COLOR, POINT_COLOR, useSurface } from '@/theme/tokens';
import { number } from '@/utils/format';
import { useT } from '@/i18n';

/**
 * THE MEMBER'S TWO ESHOP CARDS, side by side - as the vendor shows them.
 *
 * The Eshop issues two cards to one person, and the vendor's account page
 * (AccountEshopInfoPage) draws both:
 *
 *   THE CUSTOMER CARD   numbered by `customer_no`, drawn by `card_level`
 *                       (0-5); it carries the prize value and the experience
 *                       that decides the level
 *   THE WALLET CARD     numbered by `vip_no`, drawn by `card_type`; it carries
 *                       the wallet balance and the commerce value
 *
 * This page used to be one card with all four figures on it, which answered
 * "what is my level" and hid which number a member reads out when the shop
 * asks for their wallet card.
 *
 * THE CARDS ARE DRAWN, not pictures. The vendor's are PNGs - and its five level
 * images are the same file five times, as are its gold, silver and blue wallet
 * cards, so they were placeholders there too. A gradient per tier gives each
 * level and type its own face in both colour modes and at any width.
 *
 * Money is red and points are blue under the cards, the site's rule for the
 * two units; on the cards themselves everything is white on the tier colour.
 */

/*
 * One face per customer level. 0 is a card with no level yet.
 */
const LEVEL_FACE = {
  0: ['#64748B', '#334155'],
  1: ['#0F766E', '#134E4A'],
  2: ['#2563EB', '#1E3A8A'],
  3: ['#7C3AED', '#4C1D95'],
  4: ['#D97706', '#92400E'],
  5: ['#111827', '#4B5563']
};

/*
 * The wallet card's type, as the vendor pairs them with its images:
 * 1 and 4 gold, 2 silver, 3 blue, anything else a plain card.
 */
function walletFace(type) {
  const code = Number(type);
  if (code === 1 || code === 4) return ['#D4A017', '#8A6A0C'];
  if (code === 2) return ['#A8B0BA', '#5B6470'];
  if (code === 3) return ['#1D8FE1', '#0B4F8A'];
  return ['#6B7280', '#374151'];
}

/**
 * A card, drawn at a card's proportions (85.6 x 54 mm) so it reads as one.
 *
 * The padding-bottom box holds the ratio: `aspect-ratio` is Chrome 88.
 */
function CardFace({ colours, title, number, badge }) {
  const t = useT();

  return (
    <Box position="relative" w="100%" pb="63.08%" borderRadius="16px" overflow="hidden" boxShadow="lg">
      <Flex
        position="absolute" top="0" right="0" bottom="0" left="0"
        direction="column"
        justify="space-between"
        p={{ base: 5, md: 6 }}
        color="white"
        style={{ backgroundImage: 'linear-gradient(135deg, ' + colours[0] + ', ' + colours[1] + ')' }}
      >
        <Flex justify="space-between" align="flex-start">
          <Box>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.12em" opacity={0.85}>
              {t('nav.crystalEshop')}
            </Text>
            <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="800" letterSpacing="-0.01em" mt="1">
              {title}
            </Text>
          </Box>
          {badge && (
            <Text fontSize="sm" fontWeight="700" px="2.5" py="1" borderRadius="999px" bg="whiteAlpha.300">
              {badge}
            </Text>
          )}
        </Flex>

        {/* The number is what a member reads out at the counter. */}
        <Text fontFamily="mono" fontSize={{ base: 'md', md: 'lg' }} letterSpacing="0.14em">
          {number || '—'}
        </Text>
      </Flex>
    </Box>
  );
}

function Figure({ label, value, color }) {
  const surface = useSurface();

  return (
    <Box p="4" borderRadius="14px" bg={surface.raised}>
      <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.5px">
        {label}
      </Text>
      <Text fontSize="xl" fontWeight="800" color={color} letterSpacing="-0.02em">
        {value}
      </Text>
    </Box>
  );
}

export default function EshopCard() {
  const t = useT();

  const card = useApi(() => api.account.eshopCard(), []);

  if (card.loading) return <Loading variant="grid" count={2} height="220px" />;
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
  const level = Number(info.card_level) || 0;

  return (
    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 8, lg: 10 }}>
      {/* ------------------------------------------------ customer card */}
      <Box>
        <CardFace
          colours={LEVEL_FACE[level] || LEVEL_FACE[0]}
          title={t('account.storefront.eshopcard.customerCard')}
          number={info.customer_no}
          badge={t('account.storefront.eshopcard.levelN', { level: level })}
        />
        <SimpleGrid columns={2} spacing="3" mt="4">
          <Figure
            label={t('account.storefront.eshopcard.prizeValue')}
            value={formatPrice(info.prize_value)}
            color={MONEY_COLOR}
          />
          <Figure
            label={t('account.storefront.eshopcard.expValue')}
            value={number(info.accum_value || 0)}
            color={POINT_COLOR}
          />
        </SimpleGrid>
      </Box>

      {/* -------------------------------------------------- wallet card */}
      <Box>
        <CardFace
          colours={walletFace(info.card_type)}
          title={t('account.storefront.eshopcard.walletCard')}
          number={info.vip_no}
        />
        <SimpleGrid columns={2} spacing="3" mt="4">
          <Figure
            label={t('account.storefront.eshopcard.walletBalance')}
            value={formatPrice(info.real_value)}
            color={MONEY_COLOR}
          />
          <Figure
            label={t('account.storefront.eshopcard.commerceValue')}
            value={number(info.commerce_value || 0)}
            color={POINT_COLOR}
          />
        </SimpleGrid>
      </Box>
    </SimpleGrid>
  );
}
