import React from 'react';
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react';

import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { useSurface } from '@/theme/tokens';

/**
 * 10 — WHERE CRYSTAL IS.
 *
 * A PICTURE OF A MAP, not a map. There is no tile server, no SDK, no
 * geolocation and no API key: what this chapter is for is showing a company
 * with a head office, an institute, a factory, a shop and a service network -
 * a corporate visual - and an interactive map would be a third-party script,
 * a consent question and a pin somebody has to keep accurate, all to say
 * something a drawing says better.
 *
 * IT IS THE ONE CHAPTER WITH DARK ARTWORK. A photograph must never be
 * inverted for a colour mode, but a drawn map has a dark rendering and looks
 * wrong without one - which is what the two extra image columns are for, and
 * why they fall back to the light file when an editor has not made one.
 *
 * The legend beside it is data: the locations are rows, not a list in this
 * file, so an office opening next year is a row rather than a release.
 */
export default function PresenceSection({ section, locations }) {
  const surface = useSurface();
  if (!section) return null;

  const list = locations || [];

  return (
    <Box>
      <SectionHeading
        number="10"
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
        align="center"
      />

      <ResponsiveMedia
        desktop={section.image_desktop}
        mobile={section.image_mobile}
        desktopDark={section.image_desktop_dark}
        mobileDark={section.image_mobile_dark}
        alt={section.title}
        ratio={16 / 9}
      />

      {section.description && (
        <Text
          color={surface.muted}
          fontSize={{ base: 'md', md: 'lg' }}
          mt={{ base: 6, md: 8 }}
          maxW="760px"
          mx="auto"
          textAlign="center"
        >
          {section.description}
        </Text>
      )}

      {list.length > 0 && (
        <SimpleGrid
          columns={{ base: 1, sm: 2, lg: 3 }}
          spacing={{ base: 4, md: 6 }}
          mt={{ base: 8, md: 12 }}
        >
          {list.map((location) => (
            <Flex
              key={location.id}
              gap="3" data-gap="12"
              align="flex-start"
              p="5"
              borderRadius="14px"
              border="1px solid"
              borderColor={surface.border}
              bg={surface.card}
            >
              {/* A dot rather than a pin: the map is a picture and nothing
                  here claims to point at a coordinate on it. */}
              <Box boxSize="8px" borderRadius="full" bg="brand.500" mt="7px" flexShrink={0} />
              <Box minW="0">
                <Text fontWeight="700" color={surface.text}>{location.title}</Text>
                {location.subtitle && (
                  <Text fontSize="sm" color="brand.500" fontWeight="600" mt="0.5">
                    {location.subtitle}
                  </Text>
                )}
                {location.description && (
                  <Text fontSize="sm" color={surface.muted} mt="1">
                    {location.description}
                  </Text>
                )}
              </Box>
            </Flex>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}
