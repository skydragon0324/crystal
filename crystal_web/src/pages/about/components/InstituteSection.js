import React from 'react';
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';
import * as FiIcons from 'react-icons/fi';

import ResponsiveMedia from './ResponsiveMedia';

/**
 * 05 — HOW WE INNOVATE.
 *
 * The one chapter drawn on a dark ground in BOTH colour modes. The
 * specification asks for a darker technical treatment, and a band that
 * changes character is what stops ten chapters reading as ten identical
 * full-width sections - but it has to be a deliberate dark, not an inverted
 * light one, or the text on it becomes unreadable the moment the site is
 * already dark.
 *
 * So the surface is fixed and the type on it is fixed with it. That is the
 * one place on this page where a colour is not a token, and it is why: the
 * band is the same in both modes on purpose.
 */

/** The icon an area names, or nothing. Never a wrong icon in place of one. */
function areaIcon(name) {
  return (name && FiIcons[name]) || null;
}

export default function InstituteSection({ section, researchAreas }) {
  if (!section) return null;

  const areas = researchAreas || [];

  return (
    <Box
      borderRadius={{ base: '20px', md: '28px' }}
      overflow="hidden"
      bg="#0B1220"
      color="white"
      p={{ base: 6, md: 12 }}
    >
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 8, lg: 14 }} alignItems="center">
        <Box order={{ base: 2, lg: 1 }}>
          <ResponsiveMedia
            desktop={section.image_desktop}
            mobile={section.image_mobile}
            desktopDark={section.image_desktop_dark}
            mobileDark={section.image_mobile_dark}
            alt={section.title}
            ratio={4 / 3}
            bg="whiteAlpha.100"
          />
        </Box>

        <Box order={{ base: 1, lg: 2 }}>
          <Flex align="baseline" gap="3" data-gap="12" mb="3">
            <Text
              aria-hidden="true"
              fontSize={{ base: '2xl', md: '3xl' }}
              fontWeight="800"
              color="brand.400"
              opacity={0.5}
              lineHeight="1"
            >
              05
            </Text>
            {section.eyebrow && (
              <Text
                fontSize="xs"
                fontWeight="800"
                letterSpacing="0.14em"
                textTransform="uppercase"
                color="brand.400"
              >
                {section.eyebrow}
              </Text>
            )}
          </Flex>

          <Heading as="h2" size={{ base: 'lg', md: 'xl' }} letterSpacing="-0.03em" color="white">
            {section.title}
          </Heading>

          {section.subtitle && (
            <Text fontSize={{ base: 'md', md: 'lg' }} color="brand.300" fontWeight="600" mt="3">
              {section.subtitle}
            </Text>
          )}

          {section.description && (
            <Text color="whiteAlpha.800" mt="5" fontSize={{ base: 'sm', md: 'md' }}>
              {section.description}
            </Text>
          )}
        </Box>
      </SimpleGrid>

      {areas.length > 0 && (
        <Box mt={{ base: 10, md: 14 }} pt={{ base: 8, md: 10 }} borderTop="1px solid" borderColor="whiteAlpha.200">
          <Text
            fontSize="xs"
            fontWeight="800"
            letterSpacing="0.14em"
            textTransform="uppercase"
            color="whiteAlpha.600"
            mb="6"
          >
            {/* A structural label, not company copy - so it is not from the
                API, and it is the one line here that is. */}
            Research areas
          </Text>

          <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={{ base: 5, md: 6 }}>
            {areas.map((area) => {
              const Glyph = areaIcon(area.icon);

              return (
                <Flex key={area.id} gap="3" data-gap="12" align="flex-start">
                  {Glyph && (
                    <Flex
                      align="center"
                      justify="center"
                      boxSize="36px"
                      borderRadius="10px"
                      bg="whiteAlpha.100"
                      color="brand.300"
                      flexShrink={0}
                    >
                      <Box as={Glyph} size="18px" />
                    </Flex>
                  )}
                  <Box minW="0">
                    <Text fontWeight="700" color="white">{area.title}</Text>
                    {area.description && (
                      <Text fontSize="sm" color="whiteAlpha.700" mt="1">
                        {area.description}
                      </Text>
                    )}
                  </Box>
                </Flex>
              );
            })}
          </SimpleGrid>
        </Box>
      )}
    </Box>
  );
}
