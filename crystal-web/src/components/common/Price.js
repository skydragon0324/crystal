import React from 'react';
import { Text } from '@chakra-ui/react';
import { formatPrice, MONEY_COLOR } from '@/theme/tokens';

/**
 * One rounding rule, one symbol and ONE COLOUR for money across the site.
 *
 * Red, because this is what something COSTS in real currency - as against a
 * points figure, which is the platform's own unit and is blue. An eshop order
 * can be priced in both at once and the two are never added together, so the
 * colour is carrying the unit at the speed a reader actually scans a column
 * of numbers: faster than they read the word next to them.
 *
 * `color` is still overridable - a price reversed out on a brand-coloured
 * panel has to be, and a couple are.
 *
 * IT DOES NOT WRAP. Thousands are grouped with a SPACE now (see
 * utils/format), and a space is a line-breaking opportunity to every browser
 * there is - so "$1 234.5" at the end of a narrow column would break after
 * the 1 and read as two numbers. `nowrap` is the whole cost of using the
 * separator that is unambiguous in Russian and Chinese as well as English.
 */
export default function Price({ amount, currency, ...rest }) {
  return (
    <Text as="span" fontWeight="700" color={MONEY_COLOR} whiteSpace="nowrap" {...rest}>
      {formatPrice(amount, currency)}
    </Text>
  );
}
