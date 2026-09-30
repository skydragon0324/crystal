import React from 'react';
import { Box, Flex, Icon, Text } from '@chakra-ui/react';
import { FiImage } from 'react-icons/fi';

import HeroCarousel from '@/components/product/HeroCarousel';
import { useSurface } from '@/theme/tokens';

/**
 * EVERY PICTURE IN ONE SLOT, AS AN AUTO-PLAYING CAROUSEL.
 *
 * A shop floor shows several photographs; a technology shows the certificates
 * behind it. Both are "all local files mapped to this slot, in order", so
 * they are one component over the site's existing carousel rather
 * than a second carousel - HeroCarousel already pauses on hover and in a
 * background tab, stops for a reader who asked for reduced motion, and
 * renders a single picture as a picture with no controls.
 *
 * A SLOT WITH NO FILE is a quiet placeholder of the same shape, not a
 * collapsed gap: the layout beside it is built around the frame being there,
 * and a row that changes height the day the first picture is added is a
 * layout nobody reviewed.
 *
 * @param images  [{ id, src, alt }] - one slot's pictures, from buildAbout
 * @param ratio   padding-bottom, e.g. '75%' for 4:3, '133%' for a portrait scan
 * @param fit     'cover' for a photograph, 'contain' for a certificate, so the
 *                edges of a scan are never cropped away
 */
export default function SlotCarousel({ images, ratio, fit, alt }) {
  const surface = useSurface();
  const list = images || [];

  if (!list.length) {
    return (
      <Box position="relative" pb={ratio || '75%'} borderRadius="16px" bg={surface.raised} overflow="hidden">
        {/* Four offsets rather than `inset`, which Chrome 72 does not know. */}
        <Flex
          position="absolute" top="0" right="0" bottom="0" left="0"
          align="center" justify="center" direction="column" color={surface.muted}
        >
          <Icon as={FiImage} boxSize="6" />
          {alt && (
            <Text fontSize="xs" mt="2" px="4" textAlign="center" noOfLines={2}>
              {alt}
            </Text>
          )}
        </Flex>
      </Box>
    );
  }

  const slides = list.map((picture, index) => ({
    id: picture.id || index,
    // Build-imported artwork is already a deployable URL. Keeping it in the
    // local `url` channel prevents the API upload origin being prepended.
    url: picture.src,
    alt: picture.alt || alt || ''
  }));

  return (
    <Box bg={fit === 'contain' ? surface.raised : undefined} borderRadius="16px" overflow="hidden">
      <HeroCarousel
        slides={slides}
        ratio={ratio || '75%'}
        objectFit={fit || 'cover'}
        interval={4500}
        borderRadius="16px"
        showArrows={list.length > 1}
        ariaLabel={alt}
      />
    </Box>
  );
}
