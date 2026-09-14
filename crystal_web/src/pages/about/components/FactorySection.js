import React from 'react';
import { Box, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import CertificateGrid from './CertificateGrid';
import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * 06 — WHERE WE MANUFACTURE.
 *
 * A full-width photograph of the building, then what happens inside it, then
 * the marks that say it is run properly. The picture leads because a factory
 * is the one claim on this page that a photograph actually settles.
 *
 * The quality certificates are the SAME component the corporate ones use, and
 * a different set of rows: a reader looking at a quality mark should not find
 * a business award among them, which is what the `kind` on the table is for.
 */
export default function FactorySection({ section, capabilities, certificates }) {
  const t = useT();
  const surface = useSurface();
  if (!section) return null;

  const blocks = capabilities || [];

  return (
    <Box>
      <SectionHeading
        number="06"
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
        <Text
          color={surface.muted}
          fontSize={{ base: 'md', md: 'lg' }}
          mt={{ base: 6, md: 8 }}
          maxW="820px"
        >
          {section.description}
        </Text>
      )}

      {blocks.length > 0 && (
        <SimpleGrid
          columns={{ base: 1, sm: 2, lg: 4 }}
          spacing={{ base: 4, md: 5 }}
          mt={{ base: 8, md: 12 }}
        >
          {blocks.map((block) => (
            <Box
              key={block.id}
              borderRadius="16px"
              border="1px solid"
              borderColor={surface.border}
              bg={surface.card}
              overflow="hidden"
            >
              {block.image_desktop && (
                <ResponsiveMedia
                  desktop={block.image_desktop}
                  mobile={block.image_mobile}
                  alt={block.title}
                  ratio={3 / 2}
                  rounded={false}
                />
              )}
              <Box p="5">
                <Heading as="h3" size="sm" color={surface.text}>
                  {block.title}
                </Heading>
                {block.description && (
                  <Text fontSize="sm" color={surface.muted} mt="2">
                    {block.description}
                  </Text>
                )}
              </Box>
            </Box>
          ))}
        </SimpleGrid>
      )}

      {/* Hidden entirely when there are none, rather than shown as an empty
          grid under a heading promising certificates. */}
      {certificates && certificates.length > 0 && (
        <Box mt={{ base: 10, md: 16 }}>
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
