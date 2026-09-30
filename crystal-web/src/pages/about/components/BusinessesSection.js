import React from 'react';
import { Box, Flex, Heading, Text } from '@chakra-ui/react';

import Prose from './Prose';
import SectionHeading from './SectionHeading';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';

/**
 * 02 — WHAT WE DO: the vision, then the businesses as five hexagons in a row.
 *
 * THE TITLE AND NOTHING ELSE. This was seven cards of picture, subtitle and
 * copy, and a reader skimming for "what does this company do" got seven
 * paragraphs to read before the answer. Five words in five shapes answer it
 * at a glance; the chapters below are where each one is told.
 *
 * ONE ROW FROM A TABLET UP. On a phone five hexagons across are sixty pixels
 * wide, which is narrower than "Электроника" at any readable size - so there
 * they sit as a honeycomb, three over two, which still reads as one group.
 *
 * THE SHAPE IS clip-path, and the border is a second hexagon. A clipped box
 * clips its own border away, so the outline is the outer shape in the brand
 * colour with the inner one inset over it. `clip-path: polygon()` is Chrome 55,
 * well inside the floor.
 */

/* Pointy-top hexagon. Its height is 2/sqrt(3) of its width. */
const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
const HEIGHT_RATIO = '115.47%';

function Hexagon({ title }) {
  const surface = useSurface();

  return (
    <Box
      position="relative"
      w="100%"
      pb={HEIGHT_RATIO}
      transition="transform 180ms ease"
      _hover={{ transform: 'translateY(-4px)' }}
    >
      {/* The outline: the whole shape in the brand colour. */}
      <Box
        position="absolute" top="0" right="0" bottom="0" left="0"
        bgGradient="linear(to-br, brand.400, brand.600)"
        style={{ clipPath: HEXAGON, WebkitClipPath: HEXAGON }}
      />
      {/* The face: the same shape, two pixels in. */}
      <Flex
        position="absolute" top="2px" right="2px" bottom="2px" left="2px"
        bg={surface.card}
        align="center"
        justify="center"
        px="12%"
        style={{ clipPath: HEXAGON, WebkitClipPath: HEXAGON }}
      >
        <Text
          as="h3"
          textAlign="center"
          fontWeight="800"
          color={surface.text}
          fontSize={{ base: 'xs', sm: 'sm', md: 'md', lg: 'lg' }}
          lineHeight="1.2"
          letterSpacing="-0.01em"
          wordBreak="break-word"
        >
          {title}
        </Text>
      </Flex>
    </Box>
  );
}

export default function BusinessesSection({ vision, section, businesses }) {
  const surface = useSurface();
  const items = businesses || [];

  return (
    <Box>
      {/* The vision opens the chapter: one sentence, given room. */}
      {vision && (
        <Box
          maxW="820px"
          mb={{ base: 10, md: 16 }}
          pb={{ base: 8, md: 12 }}
          borderBottom="1px solid"
          borderColor={surface.border}
        >
          {vision.eyebrow && (
            <Text
              fontSize="xs"
              fontWeight="800"
              letterSpacing="0.14em"
              textTransform="uppercase"
              color="brand.500"
              mb="3"
            >
              {vision.eyebrow}
            </Text>
          )}
          <Heading as="h2" size={{ base: 'lg', md: 'xl' }} color={surface.text} letterSpacing="-0.03em">
            {vision.title}
          </Heading>
          <Prose color={surface.muted} mt="4" fontSize={{ base: 'md', md: 'lg' }}>
            {vision.description}
          </Prose>
        </Box>
      )}

      {section && (
        <SectionHeading
          number={chapterNumber('businesses')}
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.subtitle}
        />
      )}

      {items.length > 0 && (
        /*
         * A wrapping row, CENTRED, so the phone's second line of two sits
         * under the gaps of the three above it - a grid would park it on the
         * left. Spacing is padding on each cell: a flex `gap` is Chrome 84.
         */
        <Flex role="list" wrap="wrap" justify="center" mx={{ base: '-0.375rem', md: '-0.625rem', lg: '-0.75rem' }}>
          {items.map((business) => (
            <Box
              key={business.id}
              role="listitem"
              w={{ base: '33.333%', md: (100 / items.length) + '%' }}
              px={{ base: '0.375rem', md: '0.625rem', lg: '0.75rem' }}
              pb={{ base: 3, md: 0 }}
            >
              <Hexagon title={business.title} />
            </Box>
          ))}
        </Flex>
      )}
    </Box>
  );
}
