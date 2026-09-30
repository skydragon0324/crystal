import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

import { money, number } from '@/utils/format';
import { useSurface, MONEY_COLOR, POINT_COLOR } from '@/theme/tokens';

/**
 * THE ESHOP'S VOCABULARIES, in one place because two pages read them.
 *
 * The log and the orders both have to turn a code the service sends into a
 * word a member reads, and both have to decide whether a figure is money or a
 * count. Done twice they drift: the same `USE` becomes "Used" on one page and
 * "Spent" on the other, and points pick up a decimal point on whichever page
 * forgot.
 *
 * EVERY CODE HERE GOES THROUGH t(), AND NOTHING ELSE DOES. That line is worth
 * saying out loud, because the page has two kinds of text on it and they are
 * not treated alike:
 *
 *   A CODE - `status`, `fill`, `kind`, a tender - comes out of a CLOSED SET
 *   the service and this file agree on. It has a word in every language the
 *   site speaks, and a member reading Russian must not be shown "delivering".
 *
 *   PROSE - a cancellation reason, a transaction remark, a goods name - is
 *   typed by the shop in the shop's own language. It is somebody else's data
 *   and it is passed through untouched: translating it is not possible, and
 *   guessing at it would put words in another company's mouth.
 *
 * A code this build has never heard of gets NO word rather than an invented
 * one; the caller decides whether that is a blank cell or the raw code.
 */

/**
 * What moved a balance, as opposed to which balance moved.
 *
 * The Eshop's own six (vendor_client ESHOP_FILL_TYPES). The wire value is
 * lowercase - 'pay', 'bonus', 'back', 'refund', 'combine', 'transfer' - and
 * the API upper-cases it before it gets here.
 *
 * `BONUS` IS LABELLED "CHARGE", AND ONLY THE LABEL CHANGED. The wire code is
 * still `bonus` and nothing about the request or the mapping moved; what
 * moved is the word a member reads. The vendor's own English for it is
 * "Bonus", which reads as a gift the shop handed out - but the movement it
 * marks is money going INTO the wallet, and the vendor already calls that a
 * "Charge" on the other storefront (APPSTORE_TRANSACTION_TYPE_LABELS has
 * PURCHASE / CHARGE / TRANSFER). One word for one event across both stores is
 * worth more than matching the Eshop's own inconsistent English.
 */
const FILL = {
  PAY: 'account.storefront.eshop.fillPay',
  BONUS: 'account.storefront.eshop.fillCharge',
  BACK: 'account.storefront.eshop.fillBack',
  REFUND: 'account.storefront.eshop.fillRefund',
  COMBINE: 'account.storefront.eshop.fillCombine',
  TRANSFER: 'account.storefront.eshop.fillTransfer'
};

/**
 * THE TAG COLOUR FOR EACH FILL TYPE.
 *
 * Two of these are the vendor's own: it tinted `bonus` green (#87d068) and
 * `refund` grey (#bfbfbf) and left the other four plain. The four are given
 * colours here rather than left grey because the whole point of a tag column
 * is that it can be scanned - a page of four identical grey pills is a page
 * that has to be read word by word, which is what the tag was meant to save.
 *
 * The colour never says which DIRECTION the money went. That is the sign's
 * job, and the amount column's colour already carries the unit.
 */
const FILL_TONE = {
  PAY: 'purple',
  BONUS: 'green',
  BACK: 'teal',
  REFUND: 'gray',
  COMBINE: 'blue',
  TRANSFER: 'orange'
};

/**
 * WHICH balance moved, as opposed to what moved it.
 *
 * The vendor's ESHOP_MONEY_TYPES, keyed by the number the service sends:
 * 0 experience, 3 the wallet, 4 the bonus purse. The log carries it on every
 * row and the vendor's wallet screen gave it a column.
 */
const MONEY_TYPE = {
  0: 'account.storefront.eshop.moneyAccum',
  3: 'account.storefront.eshop.moneyWallet',
  4: 'account.storefront.eshop.moneyBonus'
};

/**
 * WHERE AN ORDER HAS GOT TO, in the member's language.
 *
 * The API collapses the service's sixteen numeric codes onto these ten names
 * (repositories/remote/eshop.api.js ORDER_STATUS) - the service distinguishes
 * stages a customer does not. The names are a closed set, so they translate;
 * StatusBadge falls back to the humanised code for anything new, which is
 * visible rather than silent.
 */
const ORDER_STATUS = {
  PENDING: 'account.storefront.eshop.statusPending',
  ACCEPTED: 'account.storefront.eshop.statusAccepted',
  DELIVERING: 'account.storefront.eshop.statusDelivering',
  DELIVERED: 'account.storefront.eshop.statusDelivered',
  FINISHED: 'account.storefront.eshop.statusFinished',
  CANCEL_PENDING: 'account.storefront.eshop.statusCancelPending',
  CANCELLED: 'account.storefront.eshop.statusCancelled',
  REFUND_PENDING: 'account.storefront.eshop.statusRefundPending',
  REFUND_ACCEPTED: 'account.storefront.eshop.statusRefundAccepted',
  REFUNDED: 'account.storefront.eshop.statusRefunded'
};

/**
 * The three tenders the Eshop sells in, and THE COLOUR EACH ONE IS READ IN.
 *
 * Foreign currency is red and native currency is blue - the site's rule for
 * the two units, the same one the Appstore wallet draws its foreign and
 * native point balances with. The colour is what carries the unit: the figure
 * is large and the word beside it is small, and a member scanning a column
 * sees the colour before they read anything.
 *
 * POINTS KEEP THEIR WORD as well as their colour. Red and blue can say which
 * of TWO currencies a figure is in and there is a third tender here that is
 * not a currency at all - so points are blue like native currency AND carry
 * the small word, because blue alone would claim they were money.
 *
 * `money: false` on points is not a display preference - points are counted
 * and currency is measured, and the two do not add up. Which is also why an
 * order shows its tenders side by side and never a total.
 */
const TENDER = {
  FOREIGN: { label: 'account.storefront.eshop.tenderForeign', money: true, colour: MONEY_COLOR },
  NATIVE: { label: 'account.storefront.eshop.tenderNative', money: true, colour: POINT_COLOR },
  POINT: { label: 'account.storefront.eshop.tenderPoint', money: false, colour: POINT_COLOR }
};

/** A code that is not in the set gets no word rather than a made-up one. */
export function fillLabel(t, code) {
  return FILL[code] ? t(FILL[code]) : null;
}

/** Grey for anything unrecognised - which never reaches a tag anyway. */
export function fillTone(code) {
  return FILL_TONE[code] || 'gray';
}

/** Likewise: an unrecognised money type leaves the column blank. */
export function moneyTypeLabel(t, code) {
  const address = MONEY_TYPE[String(Number(code))];
  return address ? t(address) : null;
}

/** Null for a status this build does not know, so the badge shows the code. */
export function orderStatusLabel(t, code) {
  return ORDER_STATUS[code] ? t(ORDER_STATUS[code]) : null;
}

export function tenderOf(kind) {
  return TENDER[kind] || TENDER.FOREIGN;
}

/**
 * A figure, written the way the whole site writes figures.
 *
 * Both branches land in utils/format - thousands grouped with a space, three
 * decimals at most, trailing zeros trimmed - so 89.90 is "89.9" and 1099.50
 * is "1 099.5" on every screen that shows them.
 *
 * THE FLAG STAYS EVEN THOUGH THE TWO ANSWERS NOW AGREE. `money()` is
 * `number()` plus a currency symbol, and no Eshop figure carries a currency
 * code, so today they print the same string. It is still passed, because the
 * call site is the only place that knows whether it is holding a price or a
 * count of points - and the day a symbol appears the two part company again.
 */
export function formatAmount(value, isMoney) {
  return isMoney ? money(value) : number(value);
}

/**
 * HOW MANY THINGS WERE BOUGHT, AND WHAT THEY COST - one tender per line.
 *
 * "1 good (89.9)", not "89.90 Foreign currency · 1". The count is what the
 * member is looking at the row to learn and it goes first; the price follows
 * in brackets, coloured by the tender it is in.
 *
 * THE SENTENCE IS TRANSLATED WHOLE, singular and plural alike, rather than
 * assembled here out of a number and a noun. English puts the count first and
 * pluralises the noun; Russian does neither, and a layout that concatenates
 * `count + ' ' + t('goods')` can only ever be right in the language it was
 * written in.
 *
 * NEVER SUMMED. An order of two imported handsets and a screen protector is
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
        const qty = Number(tender.qty) || 0;

        return (
          <Flex
            key={tender.kind}
            justify={align === 'right' ? 'flex-end' : 'flex-start'}
            align="baseline"
            gap="1.5"
            data-gap="6"
          >
            <Text fontSize="sm" color={surface.text} whiteSpace="nowrap">
              {t(
                qty === 1
                  ? 'account.storefront.eshoporders.goodsOne'
                  : 'account.storefront.eshoporders.goodsMany',
                { count: number(qty) }
              )}
            </Text>

            {/* THE UNIT, AS A COLOUR - foreign red, native blue. */}
            <Text fontWeight="700" color={meta.colour} whiteSpace="nowrap">
              ({formatAmount(tender.price, meta.money)})
            </Text>

            {/* And the word, for the tender no colour is left to describe. */}
            {!meta.money && (
              <Text fontSize="xs" color={surface.muted} whiteSpace="nowrap">
                {t(meta.label)}
              </Text>
            )}
          </Flex>
        );
      })}
    </Box>
  );
}
