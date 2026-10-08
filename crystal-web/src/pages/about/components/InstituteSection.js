import React from 'react';
import { Box, Flex, SimpleGrid, Text } from '@chakra-ui/react';
import * as FiIcons from 'react-icons/fi';

import Prose from './Prose';
import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import TechnologyShowcase from './TechnologyShowcase';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';

/**
 * 06 — HOW WE INNOVATE: the institute, its research areas, and the technology
 * Crystal writes itself.
 *
 * ON THE SAME GROUND AS EVERY OTHER CHAPTER. It was the one band drawn on a
 * fixed near-black card in both colour modes, meant to give it a "technical"
 * character. What it did in practice was look like a different website pasted
 * into the middle of this one - with its own white type, its own heading and
 * its own number styling - so it is drawn with the page's surfaces now, and
 * the chapter's character comes from what is in it.
 *
 * THREE PARTS, READ IN ORDER:
 *
 *   the institute     its picture, WIDE AND SHALLOW across the whole chapter,
 *                     then the description - which may mark the figures worth
 *                     noticing in bold. The picture led the chapter rather
 *                     than sitting in a column beside the words because it is
 *                     the building this chapter is about; at 21:9 it
 *                     establishes the place in a band rather than taking a
 *                     screenful to do it.
 *   research areas    six cards, each with its own bundled picture - or icon
 *   our technology    each technology with its OWN picture, and the one on
 *                     screen highlighting its line - see TechnologyShowcase
 */

function iconOf(name) {
  return (name && FiIcons[name]) || null;
}

function ResearchArea({ area }) {
  const surface = useSurface();
  const Glyph = iconOf(area.icon);

  return (
    <Box borderRadius="16px" border="1px solid" borderColor={surface.border} bg={surface.card} overflow="hidden">
      {area.image_desktop ? (
        <ResponsiveMedia
          desktop={area.image_desktop}
          mobile={area.image_mobile}
          alt={area.image_alt || area.title}
          ratio={16 / 10}
          rounded={false}
        />
      ) : (
        /* No picture yet: the icon, on a frame of the same shape. */
        <Flex h="0" pb="62.5%" position="relative" bg={surface.raised}>
          {Glyph && (
            <Flex position="absolute" top="0" right="0" bottom="0" left="0" align="center" justify="center" color="brand.500">
              <Box as={Glyph} size="32px" />
            </Flex>
          )}
        </Flex>
      )}

      <Box p="5">
        <Text fontWeight="700" color={surface.text}>{area.title}</Text>
        <Prose fontSize="sm" color={surface.muted} mt="1">
          {area.description}
        </Prose>
      </Box>
    </Box>
  );
}

export default function InstituteSection({ section, researchAreas, technology }) {
  const surface = useSurface();
  if (!section) return null;

  const areas = researchAreas || [];
  const tech = technology || {};
  const techItems = tech.items || [];

  return (
    <Box>
      <SectionHeading
        number={chapterNumber('institute')}
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
      />

      {/*
        * THE PICTURE FIRST, AND LOW.
        *
        * It was a 4:3 picture in the right-hand column of a two-column band.
        * That shape is nearly square, so beside a paragraph it took the
        * height of the paragraph and then some - the chapter opened with a
        * tall photograph and the words that explain it pushed down beside it.
        * Across the full width at 21:9 it is a band: the building is
        * established, and the description starts where a reader looks next.
        */}
      <ResponsiveMedia
        desktop={section.image_desktop}
        mobile={section.image_mobile}
        desktopDark={section.image_desktop_dark}
        mobileDark={section.image_mobile_dark}
        alt={section.image_alt || section.title}
        ratio={21 / 9}
      />

      <Prose
        color={surface.strong}
        fontSize={{ base: 'md', md: 'lg' }}
        lineHeight="1.8"
        mt={{ base: 6, md: 8 }}
        maxW="820px"
      >
        {section.description}
      </Prose>

      {areas.length > 0 && (
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={{ base: 5, md: 6 }} mt={{ base: 10, md: 14 }}>
          {areas.map((area) => (
            <ResearchArea key={area.id} area={area} />
          ))}
        </SimpleGrid>
      )}

      {techItems.length > 0 && (
        <Box mt={{ base: 14, md: 20 }}>
          {tech.overview && (
            <SectionHeading
              as="h3"
              eyebrow={tech.overview.eyebrow}
              title={tech.overview.title}
              description={tech.overview.subtitle}
            />
          )}

          <TechnologyShowcase
            items={techItems}
            title={tech.overview ? tech.overview.title : undefined}
          />
        </Box>
      )}
    </Box>
  );
}
