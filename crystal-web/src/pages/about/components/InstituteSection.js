import React from 'react';
import { Box, Flex, Grid, Heading, SimpleGrid, Text } from '@chakra-ui/react';
import * as FiIcons from 'react-icons/fi';

import Prose from './Prose';
import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import SlotCarousel from './SlotCarousel';
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
 *   the institute     its picture and its description, which may mark the
 *                     figures worth noticing in bold
 *   research areas    six cards, each with its own bundled picture - or icon
 *   our technology    the technologies as a list of titles, with ONE carousel
 *                     of their certificates beside it. A certificate is a
 *                     portrait scan, so the frame is portrait and the scan is
 *                     contained rather than cropped: a certificate with its
 *                     seal cut off proves nothing.
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

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 8, lg: 14 }} alignItems="center">
        <Prose color={surface.strong} fontSize={{ base: 'md', md: 'lg' }} lineHeight="1.8">
          {section.description}
        </Prose>

        <ResponsiveMedia
          desktop={section.image_desktop}
          mobile={section.image_mobile}
          desktopDark={section.image_desktop_dark}
          mobileDark={section.image_mobile_dark}
          alt={section.image_alt || section.title}
          ratio={4 / 3}
        />
      </SimpleGrid>

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

          {/*
            THE TITLES ON THE LEFT, ONE CAROUSEL ON THE RIGHT.

            There are fewer certificates than technologies, so a carousel
            per row left most rows beside an empty frame. The certificates
            belong to the block, and cycle beside the whole list. On a phone
            the list comes first and the carousel under it.
          */}
          <Grid
            templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) 260px', lg: 'minmax(0, 1fr) 300px' }}
            gridGap={{ base: 8, md: 12 }}
            alignItems="center"
          >
            <Box as="ul" listStyleType="none" borderTop="1px solid" borderColor={surface.border}>
              {techItems.map((item, index) => (
                <Flex
                  as="li"
                  key={item.id}
                  align="center"
                  py={{ base: 3, md: 4 }}
                  borderBottom="1px solid"
                  borderColor={surface.border}
                >
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    color="brand.500"
                    w="2.5rem"
                    flexShrink={0}
                    letterSpacing="0.1em"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Heading as="h4" size="sm" color={surface.text} letterSpacing="-0.01em">
                    {item.title}
                  </Heading>
                </Flex>
              ))}
            </Box>

            <Box w="100%" maxW={{ base: '280px', md: 'none' }} mx={{ base: 'auto', md: '0' }}>
              <SlotCarousel
                images={tech.overview ? tech.overview.images : []}
                ratio="133%"
                fit="contain"
                alt={tech.overview ? tech.overview.title : undefined}
              />
            </Box>
          </Grid>
        </Box>
      )}
    </Box>
  );
}
