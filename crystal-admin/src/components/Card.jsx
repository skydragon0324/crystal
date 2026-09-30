import React from 'react';
import { Box, Flex, Heading, Spacer, Text } from '@chakra-ui/react';
import { useSurface } from '../theme/tokens';

/**
 * The surface everything in the console sits on.
 *
 * One component rather than a repeated Box with six props, so that changing
 * the console's radius or border is one edit instead of ninety.
 *
 * A card does not float in this design - no shadow - it is a region of the
 * page marked out by a one pixel border.  That is what keeps a screen that is
 * mostly table from reading as a stack of floating slabs.
 */
export default function Card({ title, subtitle, actions, children, bodyProps, ...rest }) {
  const surface = useSurface();
  const bg = surface.card;
  const border = surface.border;
  const muted = surface.muted;

  return (
    <Box
      bg={bg}
      borderWidth="1px"
      borderColor={border}
      borderRadius="card"
      overflow="hidden"
      {...rest}
    >
      {(title || actions) && (
        <Flex align="center" px={5} py={4} borderBottomWidth={children ? '1px' : 0} borderColor={border}>
          <Box>
            {title && <Heading size="sm">{title}</Heading>}
            {subtitle && <Text fontSize="xs" color={muted} mt={1}>{subtitle}</Text>}
          </Box>
          <Spacer />
          {actions}
        </Flex>
      )}
      {children && <Box p={bodyProps === false ? 0 : 5} {...(bodyProps || {})}>{children}</Box>}
    </Box>
  );
}
