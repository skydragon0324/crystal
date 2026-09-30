import { useColorModeValue } from '@chakra-ui/react';
import { money } from '@/utils/format';

/**
 * The surface colours every panel on the site needs.
 *
 * IMPORTANT: like every Chakra hook this must be called before any early
 * `return` and never inside a `.map()` or after a conditional return - CRA
 * builds with warnings-as-errors, so breaking the rules of hooks fails the
 * build rather than showing up at runtime.
 */
export function useSurface() {
  return {
    page: useColorModeValue('white', 'ink.900'),
    card: useColorModeValue('white', 'ink.800'),
    raised: useColorModeValue('ink.50', 'ink.700'),
    border: useColorModeValue('ink.100', 'ink.600'),
    hover: useColorModeValue('ink.50', 'ink.700'),
    text: useColorModeValue('ink.900', 'ink.50'),
    muted: useColorModeValue('ink.400', 'ink.300'),
    strong: useColorModeValue('ink.700', 'ink.100'),
    shadow: useColorModeValue(
      '0 2px 12px rgba(20, 26, 44, 0.08)',
      '0 2px 16px rgba(0, 0, 0, 0.40)'
    ),
    shadowLifted: useColorModeValue(
      '0 12px 32px rgba(20, 26, 44, 0.14)',
      '0 16px 40px rgba(0, 0, 0, 0.55)'
    )
  };
}

/** Status pill colours shared by the account area. */
const STATUS_COLORS = {
  ACTIVE: 'green',
  PUBLISHED: 'green',
  SUCCESS: 'green',
  ANSWERED: 'green',
  OPEN: 'blue',
  PROCESSING: 'orange',
  PENDING: 'orange',
  REVIEW: 'orange',
  DRAFT: 'gray',
  CLOSED: 'gray',
  ARCHIVED: 'gray',
  LOCKED: 'red',
  REVOKED: 'red',
  FAILED: 'red',

  /*
   * THE TWO STOREFRONTS' OWN VOCABULARIES.
   *
   * These arrive from the Eshop and the Appstore, not from Crystal's tables,
   * and every one of them was falling through to grey - so a delivered order
   * and a cancelled one were the same colour, on the page whose entire job is
   * to tell them apart. Colour is doing real work on these two screens.
   */
  ACCEPTED: 'blue',
  DELIVERING: 'blue',
  DELIVERED: 'green',
  FINISHED: 'green',
  CANCELLED: 'gray',
  CANCEL_PENDING: 'orange',
  REFUND_PENDING: 'orange',
  REFUND_ACCEPTED: 'orange',
  REFUNDED: 'red',

  PURCHASING: 'orange',
  PURCHASED: 'green',
  ISSUED: 'green',
  APPROVED: 'green'
};

export function statusColor(status) {
  return STATUS_COLORS[String(status || '').toUpperCase()] || 'gray';
}

/**
 * WHAT KIND OF MONEY THIS IS, AS A COLOUR.
 *
 *   money in USD   red     what it costs in foreign currency
 *   points         blue    the platform's own unit
 *
 * The eshop prices a single order in up to three tenders at once - foreign
 * currency, native currency and points - and they are never summed, because
 * adding dollars to points is arithmetic on pounds and postage stamps. That
 * makes a column of figures where the UNIT is the thing a reader most needs
 * and the thing they are least likely to read: the number is large and the
 * word beside it is small. Colour carries it at a glance.
 *
 * Both are hooks-free constants rather than `useColorModeValue` calls,
 * because they are read inside `.map()` - see the warning on useSurface. The
 * `.400` end of each ramp is chosen to stay legible on the dark surfaces as
 * well as the light ones.
 */
export const MONEY_COLOR = 'red.400';
export const POINT_COLOR = 'blue.400';

/**
 * The colour for an amount, by what it is denominated in.
 *
 * `currency` is what the API sent. Anything that is not a currency at all -
 * a point balance, an activity score - is a point, so the ABSENCE of a
 * currency is the signal rather than a separate flag nobody remembers to
 * pass.
 */
export function amountColor(currency) {
  return currency ? MONEY_COLOR : POINT_COLOR;
}

/**
 * Formats a price the same way everywhere - one rounding rule, one symbol.
 *
 * THE RULES MOVED TO utils/format AND THE NAME STAYED HERE. Eleven screens
 * import `formatPrice` from this file and none of them care where the digits
 * are decided; what they did care about was that money looks the same on
 * every one of them, and that only holds while there is exactly one
 * implementation. It is now the same one that formats a point balance and a
 * view count, which is why a thousand is grouped identically whether it is
 * dollars or reads.
 *
 * The re-export stays rather than sending every call site to the new module:
 * `formatPrice` says what KIND of number this is where it is read, and
 * `money` is that same word one layer down.
 */
export function formatPrice(amount, currency) {
  return money(amount, currency);
}
