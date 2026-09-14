import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

import { formatPrice, useSurface, MONEY_COLOR, POINT_COLOR } from '@/theme/tokens';

/**
 * THE ESHOP'S TWO VOCABULARIES, in one place because two pages read them.
 *
 * The log and the orders both have to turn a code the service sends into a
 * word a member reads, and both have to decide whether a figure is money or a
 * count. Done twice they drift: the same `USE` becomes "Used" on one page and
 * "Spent" on the other, and points pick up a decimal point on whichever page
 * forgot.
 *
 * MONEY AND POINTS ARE FORMATTED DIFFERENTLY and that is the whole reason
 * `money` exists. Two decimal places on a points balance says the tenth of a
 * point is a thing you can hold, and a member who has 383 experience points
 * should not be told they have 383.00 of them.
 */

/** What moved a balance, as opposed to which balance moved. */
const FILL = {
  PAY: 'account.storefront.eshop.fillPay',
  CHARGE: 'account.storefront.eshop.fillCharge',
  REFUND: 'account.storefront.eshop.fillRefund',
  TRANSFER: 'account.storefront.eshop.fillTransfer',
  AWARD: 'account.storefront.eshop.fillAward',
  USE: 'account.storefront.eshop.fillUse',
  EXPIRE: 'account.storefront.eshop.fillExpire'
};

/**
 * The three tenders the Eshop sells in.
 *
 * `money: false` on points is not a display preference - points are counted
 * and currency is measured, and the two do not add up. Which is also why an
 * order shows its tenders side by side and never a total.
 */
const TENDER = {
  FOREIGN: { label: 'account.storefront.eshop.tenderForeign', money: true },
  NATIVE: { label: 'account.storefront.eshop.tenderNative', money: true },
  POINT: { label: 'account.storefront.eshop.tenderPoint', money: false }
};

/** A code that is not in the set gets no word rather than a made-up one. */
export function fillLabel(t, code) {
  return FILL[code] ? t(FILL[code]) : null;
}

export function tenderOf(kind) {
  return TENDER[kind] || TENDER.FOREIGN;
}

export function formatAmount(value, money) {
  return money ? formatPrice(value) : Number(value).toLocaleString();
}

/**
 * What an order cost, in each of the tenders it was actually paid in.
 *
 * Never summed. An order of two imported handsets and a screen protector is
 * priced in two units, and one figure covering both would be arithmetic on
 * pounds and postage stamps.
 */
export function TenderAmounts({ tenders, t, align }) {
  const surface = useSurface();
  const list = tenders || [];

  if (!list.length) return <Text color={surface.muted}>—</Text>;

  return (
    <Box textAlign={align || 'left'}>
      {list.map((tender) => {
        const meta = tenderOf(tender.kind);

        return (
          <Flex
            key={tender.kind}
            justify={align === 'right' ? 'flex-end' : 'flex-start'}
            align="baseline"
            gap="1.5"
            data-gap="6"
          >
            {/*
              THE UNIT, AS A COLOUR. An order priced in two tenders at once
              shows two figures that must never be read as one total; red is
              money, blue is points, and that lands before the small word
              beside the number does.
            */}
            <Text
              fontWeight="700"
              color={meta.money ? MONEY_COLOR : POINT_COLOR}
              whiteSpace="nowrap"
            >
              {formatAmount(tender.price, meta.money)}
            </Text>
            <Text fontSize="xs" color={surface.muted} whiteSpace="nowrap">
              {t(meta.label)} · {tender.qty}
            </Text>
          </Flex>
        );
      })}
    </Box>
  );
}
