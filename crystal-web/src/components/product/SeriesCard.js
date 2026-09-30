import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react';

import VerifiedBackground from '@/components/security/VerifiedBackground';
import { useSurface } from '@/theme/tokens';

/**
 * ONE SERIES CARD, DRAWN THE SAME WHEREVER IT APPEARS.
 *
 * A series has its own artwork - product_series.banner_image, and
 * banner_image_mobile for the phone crop - uploaded in the console and shown
 * by nothing else. There used to be two hand-rolled cards for it: the
 * homepage's portrait tile, four to a row, and the section page's letterbox
 * banner, two to a row. Same data, same endpoint, two shapes - so ONE
 * uploaded picture was centre-cropped to 5:6 in one place and to about 2.9:1
 * in the other, and there was no crop an operator could upload that looked
 * right in both. Choosing a picture for the site meant choosing which page to
 * get wrong.
 *
 * The homepage's tile is the one that survived, because it is the one the
 * artwork is cut for: 1080x1350 is the mobile crop the schema names, and a
 * portrait tile is what fits two-up on a phone without becoming a strip.
 *
 * THE GRID BELONGS WITH THE CARD. `SERIES_GRID` is exported beside it and both
 * pages spread it, because a shared card in two different grids is two
 * different widths again - which is exactly the bug this file closes.
 */

/** Two up on a phone, four across from the tablet up. */
export const SERIES_GRID = {
  columns: { base: 2, md: 4 },
  spacing: { base: 4, md: 6 }
};

export default function SeriesCard({ series, to }) {
  const surface = useSurface();

  return (
    <Box
      as={RouterLink}
      to={to}
      borderRadius="14px"
      overflow="hidden"
      bg={surface.raised}
      position="relative"
      transition="transform 180ms ease, box-shadow 180ms ease"
      _hover={{ transform: 'translateY(-4px)', boxShadow: surface.shadowLifted }}
    >
      {/*
        * 120% - a 5:6 portrait box. The picture is only drawn once its
        * signature has been checked; a series whose banner fails renders the
        * placeholder rather than the name over nothing.
        */}
      <VerifiedBackground
        position="relative"
        pb="120%"
        integrity={series.banner_integrity}
        expectedPath={series.banner_image}
        alt={series.name}
      />

      {/*
        * The name sits ON the picture, over a gradient that only darkens the
        * bottom half - a caption bar under the tile would make the card taller
        * than its artwork and the four would stop lining up.
        */}
      <Flex
        position="absolute"
        insetX="0"
        insetY="0"
        direction="column"
        justify="flex-end"
        p="4"
        bgGradient="linear(to-t, blackAlpha.700, transparent 55%)"
      >
        <Text fontWeight="800" color="white" fontSize="xl">
          {series.name}
        </Text>
        <Text fontSize="xs" color="whiteAlpha.800" noOfLines={2}>
          {series.description}
        </Text>
      </Flex>
    </Box>
  );
}

/** The grid the cards are laid out in - the same one on every page. */
export function SeriesGrid({ children }) {
  return <SimpleGrid {...SERIES_GRID}>{children}</SimpleGrid>;
}
