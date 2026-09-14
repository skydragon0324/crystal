import React, { useState } from 'react';
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { useSurface } from '@/theme/tokens';

/**
 * 08 — WHERE CUSTOMERS EXPERIENCE CRYSTAL.
 *
 * TWO DIFFERENT DESIGNS, on purpose.
 *
 *   DESKTOP is a building: the floors stack, the selected one is open, and
 *   the panel beside them changes. That is the interaction that makes three
 *   floors comprehensible as a building rather than as three cards - which
 *   is the whole point of the chapter.
 *
 *   MOBILE is the three floors in sequence, first to third. A cutaway
 *   building on a 360px screen is a diagram nobody can read and a control
 *   nobody can hit; scrolling past three floors in order says the same thing.
 *
 * CLICK, NEVER HOVER. A floor selector that opens on hover is a floor
 * selector that does not exist on a touch screen.
 *
 * WHAT IS ON EACH FLOOR COMES FROM THE CONSOLE. The stack is drawn from
 * `floor_number` - highest at the top, because that is where the third floor
 * is - and nothing here assumes what is sold on any of them.
 */
export default function ShopSection({ section, floors }) {
  const surface = useSurface();

  const list = floors || [];
  const [selectedId, setSelectedId] = useState(null);

  if (!section) return null;

  /* Opens on the ground floor: the one somebody walks into. */
  const active = list.filter((floor) => floor.id === selectedId)[0] || list[0] || null;

  /* Top floor first in the stack, because that is where it is. */
  const stacked = list.slice().sort((a, b) => b.floor_number - a.floor_number);

  return (
    <Box>
      <SectionHeading
        number="08"
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
      />

      <ResponsiveMedia
        desktop={section.image_desktop}
        mobile={section.image_mobile}
        alt={section.title}
        ratio={21 / 9}
      />

      {section.description && (
        <Text color={surface.muted} fontSize={{ base: 'md', md: 'lg' }} mt="6" maxW="820px">
          {section.description}
        </Text>
      )}

      {list.length > 0 && (
        <>
          {/* ------------------------------------------- desktop building */}
          <SimpleGrid
            display={{ base: 'none', lg: 'grid' }}
            columns={2}
            spacing="10"
            mt="12"
            templateColumns="minmax(0, 380px) minmax(0, 1fr)"
          >
            <Box>
              {stacked.map((floor) => {
                const isActive = active && floor.id === active.id;

                return (
                  <Flex
                    key={floor.id}
                    as="button"
                    type="button"
                    w="100%"
                    align="center"
                    gap="4" data-gap="16"
                    px="5"
                    py="5"
                    textAlign="left"
                    aria-pressed={isActive}
                    borderWidth="1px"
                    /* One stack, not three cards: the borders collapse into
                       each other so it reads as a building. */
                    borderColor={isActive ? 'brand.500' : surface.border}
                    borderTopRadius={floor === stacked[0] ? '16px' : '0'}
                    borderBottomRadius={floor === stacked[stacked.length - 1] ? '16px' : '0'}
                    mt={floor === stacked[0] ? '0' : '-1px'}
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
                    >
                      {floor.floor_number}F
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
              <Box>
                <ResponsiveMedia
                  desktop={active.image_desktop}
                  mobile={active.image_mobile}
                  alt={active.title}
                  ratio={16 / 10}
                />
                <Heading as="h3" size="md" color={surface.text} mt="6" letterSpacing="-0.02em">
                  {active.title}
                </Heading>
                {active.description && (
                  <Text color={surface.muted} mt="3">{active.description}</Text>
                )}
              </Box>
            )}
          </SimpleGrid>

          {/* ------------------------------------------- mobile sequence */}
          <Box display={{ base: 'block', lg: 'none' }} mt="10">
            {list.map((floor, index) => (
              <Box key={floor.id} mb="10">
                <Flex align="baseline" gap="3" data-gap="12" mb="3">
                  <Text fontSize="lg" fontWeight="800" color="brand.500">
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    letterSpacing="0.12em"
                    textTransform="uppercase"
                    color={surface.muted}
                  >
                    {floor.subtitle || floor.floor_number + 'F'}
                  </Text>
                </Flex>

                <ResponsiveMedia
                  desktop={floor.image_desktop}
                  mobile={floor.image_mobile}
                  alt={floor.title}
                  ratio={4 / 3}
                />

                <Heading as="h3" size="sm" color={surface.text} mt="4">
                  {floor.title}
                </Heading>
                {floor.description && (
                  <Text fontSize="sm" color={surface.muted} mt="2">
                    {floor.description}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
