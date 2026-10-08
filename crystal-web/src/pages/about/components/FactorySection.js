import React from 'react';
import { Box, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import CertificateCarousel from './CertificateCarousel';
import Prose from './Prose';
import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * 07 — WHERE, AND HOW, WE MANUFACTURE.
 *
 * ONE CHAPTER FOR ONE BUILDING. This used to be two numbered chapters -
 * "Factory" and then "Manufacturing" - describing the same site twice, with a
 * block of four "capabilities" in the first and a block of four more in the
 * second, plus an eight-stage diagram. It is one story now, told in order:
 *
 *   the building     what it is, READ BESIDE its photograph, and the quality
 *                    marks under both - the evidence for the claim the
 *                    sentence makes, next to the sentence rather than at the
 *                    far end of the chapter
 *   the six steps    from components to a sealed box, each with its own
 *                    picture, numbered so they read as a sequence
 *
 * THE DESCRIPTION SITS BESIDE THE PHOTOGRAPH on a desktop. Under it, a 21:9
 * band left a single paragraph alone on a very wide line - the full width of
 * the page for three sentences - and pushed the marks that back them up a
 * screen further down. Side by side, the sentence and the building are read
 * together, which is what they are for. On a phone they stack, photograph
 * first.
 *
 * The old #manufacturing anchor lands here (see CHAPTER_ALIASES).
 */
export default function FactorySection({ section, manufacturing, certificates }) {
  const t = useT();
  const surface = useSurface();
  if (!section) return null;

  const making = manufacturing || {};
  const flow = making.flow || [];

  return (
    <Box>
      <SectionHeading
        number={chapterNumber('factory')}
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
      />

      <SimpleGrid
        columns={{ base: 1, lg: 2 }}
        spacing={{ base: 6, lg: 12 }}
        alignItems="center"
        /* The words get the narrower column: the photograph is the thing
           being described, and a paragraph is easier to read short. */
        templateColumns={{ base: '1fr', lg: '45fr 55fr' }}
      >
        <Box order={{ base: 2, lg: 1 }}>
          <Prose color={surface.muted} fontSize={{ base: 'md', md: 'lg' }}>
            {section.description}
          </Prose>
        </Box>

        <Box order={{ base: 1, lg: 2 }}>
          <ResponsiveMedia
            desktop={section.image_desktop}
            mobile={section.image_mobile}
            alt={section.image_alt || section.title}
            ratio={16 / 10}
          />
        </Box>
      </SimpleGrid>

      {/*
        * THE MARKS, DIRECTLY UNDER THE BUILDING THEY CERTIFY.
        *
        * They used to close the chapter, after the six steps - thirteen cards
        * in a grid, which is a screen and a half of scrolling between the
        * claim and its evidence. As a row beside the photograph they are part
        * of the same statement, and four of them are visible at a desktop
        * width with the rest arriving.
        */}
      {certificates && certificates.length > 0 && (
        <Box mt={{ base: 10, md: 12 }}>
          <Heading
            as="h3"
            size="sm"
            color={surface.muted}
            letterSpacing="0.12em"
            textTransform="uppercase"
            mb="5"
          >
            {t('about.components.factorysection.qualityCertifications')}
          </Heading>

          <CertificateCarousel
            certificates={certificates}
            ariaLabel={t('about.components.factorysection.qualityCertifications')}
          />
        </Box>
      )}

      {flow.length > 0 && (
        <Box mt={{ base: 12, md: 16 }}>
          {making.overview && (
            <SectionHeading
              as="h3"
              eyebrow={making.overview.eyebrow}
              title={making.overview.title}
              description={making.overview.subtitle}
            />
          )}

          <SimpleGrid as="ol" columns={{ base: 1, sm: 2, lg: 3 }} spacing={{ base: 5, md: 6 }} listStyleType="none">
            {flow.map((step, index) => (
              <Box
                as="li"
                key={step.id}
                borderRadius="16px"
                border="1px solid"
                borderColor={surface.border}
                bg={surface.card}
                overflow="hidden"
              >
                {step.image_desktop ? (
                  <ResponsiveMedia
                    desktop={step.image_desktop}
                    mobile={step.image_mobile}
                    alt={step.image_alt || step.title}
                    ratio={16 / 10}
                    rounded={false}
                  />
                ) : (
                  <Box h="0" pb="62.5%" bg={surface.raised} />
                )}

                <Box p="5">
                  <Text fontSize="xs" fontWeight="800" color="brand.500" letterSpacing="0.1em">
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Heading as="h4" size="sm" color={surface.text} mt="1">
                    {step.title}
                  </Heading>
                  <Prose fontSize="sm" color={surface.muted} mt="2">
                    {step.description}
                  </Prose>
                </Box>
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      )}

    </Box>
  );
}
