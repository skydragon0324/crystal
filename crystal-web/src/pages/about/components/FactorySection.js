import React from 'react';
import { Box, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import CertificateGrid from './CertificateGrid';
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
 *   the building     its photograph and what it is
 *   the six steps    from components to a sealed box, each with its own
 *                    picture, numbered so they read as a sequence
 *   the marks        the quality certificates, each with its own scan
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

      <ResponsiveMedia
        desktop={section.image_desktop}
        mobile={section.image_mobile}
        alt={section.image_alt || section.title}
        ratio={21 / 9}
      />

      <Prose color={surface.muted} fontSize={{ base: 'md', md: 'lg' }} mt={{ base: 6, md: 8 }} maxW="820px">
        {section.description}
      </Prose>

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

      {/* Hidden entirely when there are none. */}
      {certificates && certificates.length > 0 && (
        <Box mt={{ base: 12, md: 16 }}>
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
          <CertificateGrid certificates={certificates} />
        </Box>
      )}
    </Box>
  );
}
