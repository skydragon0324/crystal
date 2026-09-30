import React from 'react';
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react';
import * as FiIcons from 'react-icons/fi';

import Prose from './Prose';
import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';

/**
 * 09 — HOW WE SUPPORT CUSTOMERS: a picture, and the services beside it.
 *
 * Two things are gone from here. The chapter's own paragraph, which restated
 * what the list below it says item by item; and the "We design - We
 * manufacture - We sell - We support" strip above it, a slogan that pushed the
 * services down without telling a reader anything they could act on.
 *
 * EACH SERVICE KEEPS ITS LINE BREAKS. A service is a short line of what it is
 * and a line of how it works, and written as one paragraph the second reads
 * as a run-on of the first.
 */

function serviceIcon(name) {
  return (name && FiIcons[name]) || null;
}

export default function ServiceSection({ section, services }) {
  const surface = useSurface();
  if (!section) return null;

  const items = services || [];

  return (
    <Box>
      <SectionHeading
        number={chapterNumber('service')}
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
      />

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 8, lg: 14 }} alignItems="center">
        <ResponsiveMedia
          desktop={section.image_desktop}
          mobile={section.image_mobile}
          alt={section.image_alt || section.title}
          ratio={4 / 3}
        />

        {items.length > 0 && (
          <Box>
            {items.map((service, index) => {
              const Glyph = serviceIcon(service.icon);

              return (
                <Flex
                  key={service.id}
                  align="flex-start"
                  py="4"
                  borderTop={index === 0 ? 'none' : '1px solid'}
                  borderColor={surface.border}
                >
                  {Glyph && (
                    <Box as={Glyph} size="18px" color="brand.500" flexShrink={0} mr="3" style={{ marginTop: '3px' }} />
                  )}
                  <Box minW="0">
                    <Text fontWeight="700" color={surface.text}>{service.title}</Text>
                    <Prose fontSize="sm" color={surface.muted} mt="1" lineHeight="1.7">
                      {service.description}
                    </Prose>
                  </Box>
                </Flex>
              );
            })}
          </Box>
        )}
      </SimpleGrid>
    </Box>
  );
}
