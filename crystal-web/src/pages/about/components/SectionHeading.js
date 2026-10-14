import React from 'react';
import { Box, Flex, Heading, Text } from '@chakra-ui/react';

import { useSurface } from '@/theme/tokens';
import { SHOW_EYEBROWS } from '../constants';

/**
 * THE TOP OF A CHAPTER: its number, its eyebrow, its heading and its standfirst.
 *
 * Written once because ten chapters open the same way, and because the chapter
 * number is the device that makes the page read as one story rather than as
 * ten bands that happen to be stacked.
 *
 * THE NUMBER IS DECORATION, and is marked as such. It is drawn large and faint
 * beside the heading, and it is `aria-hidden` with the same figure carried in
 * the visually-hidden text of the heading's own eyebrow - a screen reader
 * should hear "Chapter six, Eproduct Factory", not "zero six" as a paragraph
 * of its own.
 *
 * THE EYEBROW ROW IS CURRENTLY HIDDEN - see SHOW_EYEBROWS in constants.js.
 * The whole row goes, number included, rather than the row surviving as an
 * empty flex box with its own bottom margin.
 */
export default function SectionHeading({ number, eyebrow, title, description, align, as }) {
  const surface = useSurface();
  const centred = align === 'center';

  return (
    <Box
      /*
       * FULL WIDTH WHEN IT IS LEFT-ALIGNED, and a measure when it is centred.
       *
       * Every chapter's standfirst was capped at 820px, which on a desktop
       * put a paragraph in the left half of the band with nothing beside it.
       * Centred is the exception: that text is not stranded on one side, and
       * a long centred line is the worst case for a reader, who has no fixed
       * left edge to come back to.
       */
      maxW={centred ? '760px' : undefined}
      mx={centred ? 'auto' : undefined}
      textAlign={centred ? 'center' : 'left'}
      mb={{ base: 8, md: 12 }}
    >
      {SHOW_EYEBROWS && (number || eyebrow) && (
      <Flex
        align="baseline"
        gap="3" data-gap="12"
        justify={centred ? 'center' : 'flex-start'}
        mb="3"
      >
        {number && (
          <Text
            aria-hidden="true"
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight="800"
            lineHeight="1"
            color="brand.500"
            opacity={0.35}
            letterSpacing="-0.04em"
          >
            {number}
          </Text>
        )}

        {eyebrow && (
          <Text
            fontSize="xs"
            fontWeight="800"
            letterSpacing="0.14em"
            textTransform="uppercase"
            color="brand.500"
          >
            {eyebrow}
          </Text>
        )}
      </Flex>
      )}

      <Heading
        as={as || 'h2'}
        size={{ base: 'lg', md: 'xl' }}
        color={surface.text}
        letterSpacing="-0.03em"
        lineHeight="1.15"
      >
        {title}
      </Heading>

      {description && (
        <Text color={surface.muted} mt="4" fontSize={{ base: 'md', md: 'lg' }}>
          {description}
        </Text>
      )}
    </Box>
  );
}
