import React, { useState } from 'react';
import { Box, Flex, Grid, Heading, Icon, Image, Text } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { FiImage } from 'react-icons/fi';

import useRotation from '../hooks/useRotation';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * THE TECHNOLOGIES CRYSTAL WRITES ITSELF, AND THE ONE BEING SHOWN.
 *
 * ONE PICTURE PER TECHNOLOGY, which is the change this component exists for.
 * The block used to be a list of seven titles beside a carousel of four
 * certificate scans: the pictures cycled, and nothing connected the picture
 * on screen to any line in the list. Each technology owns its own slot now
 * (content.js, ITEMS.TECHNOLOGY), so the picture and the title are the same
 * row and the connection can be SHOWN.
 *
 * TWO LAYOUTS, BOTH DRIVEN BY ONE INDEX.
 *
 *   DESKTOP keeps the list, which is the thing worth reading - seven names a
 *   reader can take in at a glance - and puts the picture beside it. As the
 *   picture changes, ITS line lights up: the brand rule, the brand colour and
 *   `aria-current`, so the pairing is not carried by colour alone. Clicking a
 *   line shows its picture, which turns the list into the control it already
 *   looked like.
 *
 *   MOBILE drops the list and shows the picture with its name UNDER it, one
 *   at a time. A seven-row list plus a picture on a phone is two things
 *   competing for one column, and the name under the picture says everything
 *   the row said.
 *
 * ONE INDEX, SO BOTH LAYOUTS AGREE. Only one of them is visible at a time -
 * they are hidden with `display` rather than mounted conditionally, so that a
 * resize does not restart the rotation - and a shared index means a reader who
 * rotates the phone is looking at the same technology afterwards.
 */
export default function TechnologyShowcase({ items, title }) {
  const t = useT();
  const surface = useSurface();

  const list = items || [];

  /* A reader who has touched it is reading it; see useRotation. */
  const [touched, setTouched] = useState(false);
  const rotation = useRotation(list.length, 4500, touched);

  if (!list.length) return null;

  const active = list[Math.min(rotation.index, list.length - 1)];
  const pictureOf = (item) => (item.images && item.images[0]) || null;

  /*
   * THE FRAME IS THE SAME SHAPE WHATEVER IS IN IT.
   *
   * `pb` as a percentage is a height expressed in terms of the width, which
   * is the one way to reserve a box's shape that Chrome 72 understands -
   * `aspect-ratio` is years later. Without it the block changes height as
   * each picture loads, and this chapter is reached by an anchor.
   */
  const frame = (item, rounded) => {
    const picture = pictureOf(item);

    return (
      <Box
        position="relative"
        pb="62.5%"
        borderRadius={rounded === false ? '0' : '16px'}
        overflow="hidden"
        bg={surface.raised}
      >
        {picture ? (
          <Image
            src={picture.src}
            alt={picture.alt || item.title}
            position="absolute"
            top="0"
            left="0"
            w="100%"
            h="100%"
            objectFit="cover"
            loading="lazy"
          />
        ) : (
          /* Four offsets rather than `inset`, which Chrome 72 does not know. */
          <Flex
            position="absolute" top="0" right="0" bottom="0" left="0"
            align="center" justify="center" color={surface.muted}
          >
            <Icon as={FiImage} boxSize="6" />
          </Flex>
        )}
      </Box>
    );
  };

  const arrow = (direction, glyph, label) => (
    <Box
      as="button"
      type="button"
      aria-label={label}
      p="2"
      borderRadius="full"
      color={surface.muted}
      _hover={{ color: 'brand.500' }}
      onClick={() => rotation.step(direction)}
    >
      <Icon as={glyph} boxSize="5" />
    </Box>
  );

  const dots = (
    <Flex align="center" justify="center" wrap="wrap" data-gap-wrap>
      {list.map((item, index) => (
        <Box
          key={item.id}
          as="button"
          type="button"
          aria-label={item.title}
          aria-current={index === rotation.index ? 'true' : undefined}
          mx="1"
          my="1"
          w={index === rotation.index ? '22px' : '8px'}
          h="8px"
          borderRadius="full"
          bg={index === rotation.index ? 'brand.500' : surface.border}
          transition="width 160ms ease, background 160ms ease"
          onClick={() => rotation.setIndex(index)}
        />
      ))}
    </Flex>
  );

  return (
    <Box
      onMouseEnter={() => setTouched(true)}
      onMouseLeave={() => setTouched(false)}
      onFocus={() => setTouched(true)}
      onBlur={() => setTouched(false)}
    >
      {/* ------------------------------------------- phone: picture, then name */}
      <Box display={{ base: 'block', md: 'none' }} role="group" aria-label={title}>
        {/*
          * EVERY PICTURE IS MOUNTED AND ONE IS SHOWN, rather than swapping the
          * `src` of a single image: changing the source shows the frame empty
          * while the next file arrives, and on a phone that is a grey box
          * between every technology.
          */}
        <Box position="relative">
          {list.map((item, index) => (
            <Box
              key={item.id}
              display={index === rotation.index ? 'block' : 'none'}
              aria-hidden={index === rotation.index ? undefined : 'true'}
            >
              {frame(item)}
            </Box>
          ))}
        </Box>

        <Flex align="center" justify="space-between" mt="4">
          {arrow(-1, ChevronLeftIcon, t('components.herocarousel.previousSlide'))}

          <Box textAlign="center" px="2" minW="0" flex="1">
            <Text fontSize="xs" fontWeight="800" color="brand.500" letterSpacing="0.1em">
              {String(rotation.index + 1).padStart(2, '0')}
            </Text>
            <Heading as="h4" size="sm" color={surface.text} mt="1" letterSpacing="-0.01em">
              {active.title}
            </Heading>
          </Box>

          {arrow(1, ChevronRightIcon, t('components.herocarousel.nextSlide'))}
        </Flex>

        <Box mt="4">{dots}</Box>
      </Box>

      {/* --------------------------------- desktop: the list, and its picture */}
      <Box display={{ base: 'none', md: 'block' }}>
        <Grid
          templateColumns={{ md: 'minmax(0, 1fr) 320px', lg: 'minmax(0, 1fr) 420px' }}
          gridGap={{ md: 10, lg: 14 }}
          alignItems="center"
        >
          <Box as="ul" listStyleType="none" borderTop="1px solid" borderColor={surface.border}>
            {list.map((item, index) => {
              const isActive = index === rotation.index;

              return (
                <Flex
                  as="li"
                  key={item.id}
                  borderBottom="1px solid"
                  borderColor={surface.border}
                >
                  <Flex
                    as="button"
                    type="button"
                    w="100%"
                    align="center"
                    textAlign="left"
                    py="4"
                    /* The rule on the left is the highlight's anchor: it moves
                       the row slightly, which the eye follows. */
                    borderLeft="3px solid"
                    borderColor={isActive ? 'brand.500' : 'transparent'}
                    pl={isActive ? '4' : '0'}
                    transition="padding-left 180ms ease, border-color 180ms ease"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => rotation.setIndex(index)}
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="800"
                      color="brand.500"
                      w="2.5rem"
                      flexShrink={0}
                      letterSpacing="0.1em"
                      opacity={isActive ? 1 : 0.55}
                      transition="opacity 180ms ease"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </Text>

                    <Heading
                      as="h4"
                      size="sm"
                      color={isActive ? 'brand.500' : surface.text}
                      letterSpacing="-0.01em"
                      transition="color 180ms ease"
                    >
                      {item.title}
                    </Heading>
                  </Flex>
                </Flex>
              );
            })}
          </Box>

          <Box>
            <Box position="relative">
              {list.map((item, index) => (
                <Box
                  key={item.id}
                  display={index === rotation.index ? 'block' : 'none'}
                  aria-hidden={index === rotation.index ? undefined : 'true'}
                >
                  {frame(item)}
                </Box>
              ))}
            </Box>

            {/* The name under the picture here too, so the pairing is legible
                without following the highlight back to the list. */}
            <Text fontSize="sm" color={surface.muted} textAlign="center" mt="3">
              {active.title}
            </Text>
          </Box>
        </Grid>
      </Box>
    </Box>
  );
}
