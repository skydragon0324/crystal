import React from 'react';
import { Flex, Icon, Link, Stack, Text } from '@chakra-ui/react';
import { FiPhone } from 'react-icons/fi';

import { useSurface } from '@/theme/tokens';

/**
 * The `tel:` address for a number as a centre writes it.
 *
 * Only what a dialler dials - digits, a leading +, and * and # for an
 * extension menu. "400-820-1001" and "021 6234 5678" are written for people;
 * a phone handed the spaces and dashes of the second one has been known to
 * dial "021" and stop.
 */
export function telHref(phone) {
  return 'tel:' + String(phone || '').replace(/[^\d+*#]/g, '');
}

/**
 * A SERVICE CENTRE'S NUMBERS, EACH ONE A CALL.
 *
 * A centre has one number or several - a front desk, a repair line, an
 * after-hours mobile - in the order the console lists them, which is the
 * order they are shown in: the first is the one somebody calling for the
 * first time should try. Every number is a tap-to-call link, because the
 * person reading this card is very often on a phone already.
 *
 * The LABEL is the centre's own word for the number, typed in the console,
 * and is shown as it was typed - it is the centre speaking, like its name.
 * A number without one is just the number.
 *
 * `phones` is the API's [{ phone, label }]. Nothing at all is drawn for an
 * empty list, so a card does not grow a phone icon with nothing beside it.
 */
export default function PhoneLinks({ phones, ...rest }) {
  const surface = useSurface();
  const list = (Array.isArray(phones) ? phones : []).filter((entry) => entry && entry.phone);

  if (!list.length) return null;

  return (
    <Stack spacing="1" {...rest}>
      {list.map((entry) => (
        <Flex key={entry.phone} gap="2" data-gap="8" align="center" minW="0">
          <Icon as={FiPhone} color={surface.muted} boxSize="4" flexShrink={0} />
          <Link href={telHref(entry.phone)} fontSize="sm" fontWeight="600" color="brand.500" whiteSpace="nowrap">
            {entry.phone}
          </Link>
          {entry.label ? (
            <Text as="span" fontSize="xs" color={surface.muted} noOfLines={1}>
              {entry.label}
            </Text>
          ) : null}
        </Flex>
      ))}
    </Stack>
  );
}
