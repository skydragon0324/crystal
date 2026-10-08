import React from 'react';
import { AspectRatio, Box, Flex, Image, Text } from '@chakra-ui/react';

import { useSurface } from '@/theme/tokens';

/**
 * ONE CERTIFICATE, AS A CARD THAT OPENS.
 *
 * Pulled out of the grid this page used to show, because the card is the part
 * worth keeping: the grid was an ARRANGEMENT of it, the carousel is another,
 * and the version of this that lived inside the grid was about to be copied -
 * which is how two arrangements of one card slowly stop looking alike.
 *
 * THE THUMBNAIL IS DRAWN SMALL AND THE SCAN IS NOT LOADED HERE. A certificate
 * has one file; the card shows it at card size and the dialog shows it at
 * full size, and only the dialog that is open is ever mounted.
 *
 * A certificate with no scan falls back to its own name on a tinted card
 * rather than to a generic trophy icon, which would say less than the words
 * already do.
 */
export default function CertificateCard({ certificate, onOpen, eager }) {
  const surface = useSurface();

  return (
    <Box
      as="button"
      type="button"
      textAlign="left"
      w="100%"
      /* The card is as tall as its row, so a shorter name does not leave a
         card floating above its neighbours in a carousel. */
      h="100%"
      display="flex"
      flexDirection="column"
      borderRadius="14px"
      border="1px solid"
      borderColor={surface.border}
      bg={surface.card}
      overflow="hidden"
      transition="border-color 160ms ease, transform 160ms ease"
      _hover={{ borderColor: 'brand.500', transform: 'translateY(-3px)' }}
      onClick={() => onOpen(certificate)}
    >
      <AspectRatio ratio={3 / 4} bg={surface.raised} w="100%" flexShrink={0}>
        {certificate.image ? (
          <Image
            src={certificate.image}
            alt={certificate.name}
            /*
             * `contain`, not `cover`: a certificate is a document with a
             * border and a seal, and cropping it to a card's shape cuts off
             * whichever edge carries the issuer's mark.
             */
            objectFit="contain"
            loading={eager ? 'eager' : 'lazy'}
          />
        ) : (
          <Flex align="center" justify="center" px="3">
            <Text fontSize="xs" color={surface.muted} textAlign="center" noOfLines={4}>
              {certificate.name}
            </Text>
          </Flex>
        )}
      </AspectRatio>

      <Box p="3">
        <Text fontSize="sm" fontWeight="700" color={surface.text} noOfLines={2}>
          {certificate.name}
        </Text>
        {certificate.issuer && (
          <Text fontSize="xs" color={surface.muted} mt="1" noOfLines={1}>
            {certificate.issuer}
          </Text>
        )}
        {certificate.year && (
          <Text fontSize="xs" color="brand.500" fontWeight="600" mt="1">
            {certificate.year}
          </Text>
        )}
      </Box>
    </Box>
  );
}
