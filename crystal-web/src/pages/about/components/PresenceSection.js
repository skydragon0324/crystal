import React from 'react';
import { Box, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import Prose from './Prose';
import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';

/**
 * 10 — WHERE CRYSTAL IS: two places, each with its photograph.
 *
 * It was a drawn map and a legend of six locations. The two a visitor can
 * actually go and see - the headquarters and the shop - are what the chapter
 * shows now, as two pictures side by side, each captioned with where it is.
 */
export default function PresenceSection({ section, locations }) {
  const surface = useSurface();
  if (!section) return null;

  const list = locations || [];

  return (
    <Box>
      <SectionHeading
        number={chapterNumber('presence')}
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
        align="center"
      />

      {list.length > 0 && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 6, md: 8 }}>
          {list.map((location) => (
            <Box key={location.id}>
              {location.image_desktop ? (
                <ResponsiveMedia
                  desktop={location.image_desktop}
                  mobile={location.image_mobile}
                  alt={location.image_alt || location.title}
                  ratio={4 / 3}
                />
              ) : (
                <Box h="0" pb="75%" borderRadius="18px" bg={surface.raised} />
              )}

              <Heading as="h3" size="md" color={surface.text} mt="5" letterSpacing="-0.02em">
                {location.title}
              </Heading>
              {location.subtitle && (
                <Text fontSize="sm" color="brand.500" fontWeight="600" mt="1">
                  {location.subtitle}
                </Text>
              )}
              <Prose fontSize="sm" color={surface.muted} mt="2">
                {location.description}
              </Prose>
            </Box>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}
