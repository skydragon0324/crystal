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
 */
export default function Price({ amount, currency, ...rest }) {
  return (
    <Text as="span" fontWeight="700" color={MONEY_COLOR} {...rest}>
      {formatPrice(amount, currency)}
    </Text>
  );
}
