import React from 'react';
import { Box, Flex, Heading, Icon, SimpleGrid, Text } from '@chakra-ui/react';
import { FiArrowDown, FiArrowRight } from 'react-icons/fi';

import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * 07 — HOW WE MANUFACTURE.
 *
 * CAPABILITIES FIRST, THEN THE FLOW, and the order is the argument: the
 * chapter is advertising what Crystal can do, and the eight-stage process is
 * the evidence rather than the headline. Titled as a flow alone it would read
 * as an internal diagram on a customer page.
 *
 * THE FLOW HAS TWO DIRECTIONS. Horizontal on a wide screen, where eight
 * stages fit and the arrows carry the sequence; vertical below that, where
 * they do not - and eight stages squeezed onto a phone row is the one thing
 * on this page that would force the whole document to scroll sideways.
 *
 * The order comes from `sort_order` in every case, never from where a stage
 * happens to sit in CSS.
 */
export default function ManufacturingSection({ section, capabilities, flow }) {
  const t = useT();
  const surface = useSurface();
  if (!section) return null;

  const blocks = capabilities || [];
  const stages = flow || [];

  return (
    <Box>
      <SectionHeading
        number="07"
        eyebrow={section.eyebrow}
        title={section.title}
        description={section.subtitle}
      />

      {blocks.length > 0 && (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 5, md: 6 }}>
          {blocks.map((block) => (
            <Box
              key={block.id}
              borderRadius="18px"
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
                  ratio={16 / 9}
                  rounded={false}
                />
              )}
              <Box p={{ base: 5, md: 6 }}>
                <Heading as="h3" size="md" color={surface.text} letterSpacing="-0.02em">
                  {block.title}
                </Heading>
                {block.description && (
                  <Text fontSize="sm" color={surface.muted} mt="3">
                    {block.description}
                  </Text>
                )}
              </Box>
            </Box>
          ))}
        </SimpleGrid>
      )}

      {stages.length > 0 && (
        <Box mt={{ base: 12, md: 16 }}>
          <Heading
            as="h3"
            size="sm"
            color={surface.muted}
            letterSpacing="0.12em"
            textTransform="uppercase"
            mb="6"
          >
            {t('about.components.manufacturingsection.fromComponentsToFinishedProduct')}
          </Heading>

          {/*
            The same eight stages twice, laid out two ways. They are cheap -
            a number, a title and a line - so rendering both and hiding one by
            breakpoint costs less than a resize listener would.
          */}
          <Flex
            display={{ base: 'none', lg: 'flex' }}
            align="stretch"
            wrap="nowrap"
          >
            {stages.map((stage, index) => (
              <React.Fragment key={stage.id}>
                <Box flex="1" minW="0">
                  <Text fontSize="xs" fontWeight="800" color="brand.500" mb="2">
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <Text fontWeight="700" fontSize="sm" color={surface.text}>
                    {stage.title}
                  </Text>
                  {stage.description && (
                    <Text fontSize="xs" color={surface.muted} mt="2" noOfLines={4}>
                      {stage.description}
                    </Text>
                  )}
                </Box>

                {index < stages.length - 1 && (
                  <Flex align="flex-start" px="3" pt="5" flexShrink={0}>
                    <Icon as={FiArrowRight} color={surface.border} boxSize="4" />
                  </Flex>
                )}
              </React.Fragment>
            ))}
          </Flex>

          <Box display={{ base: 'block', lg: 'none' }}>
            {stages.map((stage, index) => (
              <Box key={stage.id}>
                <Flex gap="4" data-gap="16" align="flex-start">
                  <Flex
                    align="center"
                    justify="center"
                    boxSize="32px"
                    borderRadius="10px"
                    bg={surface.raised}
                    color="brand.500"
                    fontSize="xs"
                    fontWeight="800"
                    flexShrink={0}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </Flex>
                  <Box minW="0" pb="1">
                    <Text fontWeight="700" fontSize="sm" color={surface.text}>
                      {stage.title}
                    </Text>
                    {stage.description && (
                      <Text fontSize="sm" color={surface.muted} mt="1">
                        {stage.description}
                      </Text>
                    )}
                  </Box>
                </Flex>

                {index < stages.length - 1 && (
                  <Flex justify="center" w="32px" py="2">
                    <Icon as={FiArrowDown} color={surface.border} boxSize="4" />
                  </Flex>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
