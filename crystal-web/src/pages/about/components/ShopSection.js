import React, { useState } from 'react';
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import Prose from './Prose';
import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import SlotCarousel from './SlotCarousel';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';

/**
 * 08 — WHERE CUSTOMERS EXPERIENCE CRYSTAL.
 *
 * EACH FLOOR IS SEVERAL PICTURES, as a carousel. A single photograph of a
 * floor that holds a whole range shows one corner of it; every bundled
 * picture in that floor's slot is a slide.
 *
 * THE FLOOR NUMBER IS `floor`. This read `floor_number` - the name of the
 * column these rows once had in the database - and the content has said `floor`
 * since the copy moved into code. So every floor was labelled "undefinedF",
 * and the stack sorted on undefined, which is to say not at all.
 *
 * TWO DIFFERENT DESIGNS, on purpose.
 *
 *   DESKTOP is a building: the floors stack, the selected one is open, and
 *   the panel beside them changes.
 *
 *   MOBILE is the floors in sequence, first to third. A cutaway building on a
 *   360px screen is a control nobody can hit.
 *
 * CLICK, NEVER HOVER - a hover selector does not exist on a touch screen.
 */
export default function ShopSection({ section, floors }) {
  const surface = useSurface();

  const list = floors || [];
  const [selectedId, setSelectedId] = useState(null);

  if (!section) return null;

  /* Opens on the ground floor: the one somebody walks into. */
  const active = list.filter((floor) => floor.id === selectedId)[0] || list[0] || null;

  /* Top floor first in the stack, because that is where it is. */
  const stacked = list.slice().sort((a, b) => b.floor - a.floor);

  return (
    <Box>
      <SectionHeading
        number={chapterNumber('shop')}
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
      />

      <ResponsiveMedia
        desktop={section.image_desktop}
        mobile={section.image_mobile}
        alt={section.image_alt || section.title}
        ratio={21 / 9}
      />

      <Prose color={surface.muted} fontSize={{ base: 'md', md: 'lg' }} mt="6" maxW="820px">
        {section.description}
      </Prose>

      {list.length > 0 && (
        <>
          {/* ------------------------------------------- desktop building */}
          <SimpleGrid
            display={{ base: 'none', lg: 'grid' }}
            spacing="10"
            mt="12"
            templateColumns="minmax(0, 380px) minmax(0, 1fr)"
          >
            <Box>
              {stacked.map((floor, index) => {
                const isActive = active && floor.id === active.id;

                return (
                  <Flex
                    key={floor.id}
                    as="button"
                    type="button"
                    w="100%"
                    align="center"
                    px="5"
                    py="5"
                    textAlign="left"
                    aria-pressed={isActive}
                    borderWidth="1px"
                    /* One stack, not three cards: the borders collapse. */
                    borderColor={isActive ? 'brand.500' : surface.border}
                    borderTopRadius={index === 0 ? '16px' : '0'}
                    borderBottomRadius={index === stacked.length - 1 ? '16px' : '0'}
                    mt={index === 0 ? '0' : '-1px'}
                    bg={isActive ? surface.raised : surface.card}
                    position="relative"
                    zIndex={isActive ? 1 : 0}
                    transition="border-color 160ms ease, background 160ms ease"
                    _hover={{ borderColor: 'brand.500' }}
                    onClick={() => setSelectedId(floor.id)}
                  >
                    <Text
                      fontSize="lg"
                      fontWeight="800"
                      color={isActive ? 'brand.500' : surface.muted}
                      flexShrink={0}
                      w="34px"
                      mr="4"
                    >
                      {floor.floor}F
                    </Text>
                    <Box minW="0">
                      <Text fontWeight="700" color={surface.text} noOfLines={1}>
                        {floor.subtitle || floor.title}
                      </Text>
                      {floor.subtitle && (
                        <Text fontSize="sm" color={surface.muted} noOfLines={1}>
                          {floor.title}
                        </Text>
                      )}
                    </Box>
                  </Flex>
                );
              })}
            </Box>

            {active && (
              <Box minW="0">
                {/*
                  Keyed on the floor, so choosing another floor starts its
                  carousel from its own first picture rather than carrying
                  the previous floor's slide index over.
                */}
                <SlotCarousel key={active.id} images={active.images} ratio="62.5%" alt={active.title} />
                <Heading as="h3" size="md" color={surface.text} mt="6" letterSpacing="-0.02em">
                  {active.title}
                </Heading>
                <Prose color={surface.muted} mt="3">
                  {active.description}
                </Prose>
              </Box>
            )}
          </SimpleGrid>

          {/* ------------------------------------------- mobile sequence */}
          <Box display={{ base: 'block', lg: 'none' }} mt="10">
            {list.map((floor) => (
              <Box key={floor.id} mb="10">
                <Flex align="baseline" mb="3">
                  <Text fontSize="lg" fontWeight="800" color="brand.500" mr="3">
                    {floor.floor}F
                  </Text>
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    letterSpacing="0.12em"
                    textTransform="uppercase"
                    color={surface.muted}
                  >
                    {floor.subtitle}
                  </Text>
                </Flex>

                <SlotCarousel images={floor.images} ratio="75%" alt={floor.title} />

                <Heading as="h3" size="sm" color={surface.text} mt="4">
                  {floor.title}
                </Heading>
                <Prose fontSize="sm" color={surface.muted} mt="2">
                  {floor.description}
                </Prose>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
