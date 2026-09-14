import React from 'react';
import { Box, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import ResponsiveMedia from './ResponsiveMedia';
import { useSurface } from '@/theme/tokens';

/**
 * 01 — WHO WE ARE.
 *
 * The only chapter that carries the page's `h1`, and the only one whose
 * image loads eagerly: it is the thing above the fold, and lazy-loading the
 * first picture on a page is a blank rectangle in the one place nobody will
 * wait for.
 *
 * The desktop composition is text and picture side by side at 55/45 - the
 * copy is the longer of the two and gets the wider column - and on a phone
 * they stack in reading order, with the corporate facts in a 2x2 grid under
 * both. That order is deliberate: the headline and the sentence that explains
 * it come before the photograph, not after it.
 */
export default function OverviewSection({ section, facts }) {
  const surface = useSurface();
  if (!section) return null;

  return (
    <Box>
      <SimpleGrid
        columns={{ base: 1, lg: 2 }}
        spacing={{ base: 8, lg: 14 }}
        alignItems="center"
        templateColumns={{ base: '1fr', lg: '55fr 45fr' }}
      >
        <Box order={{ base: 1, lg: 1 }}>
          {section.eyebrow && (
            <Text
              fontSize="xs"
              fontWeight="800"
              letterSpacing="0.14em"
              textTransform="uppercase"
              color="brand.500"
              mb="4"
            >
              <Text as="span" aria-hidden="true" opacity={0.6} mr="2">01</Text>
              {section.eyebrow}
            </Text>
          )}

          {/*
            The page's only h1. The chapter headings below are all h2, which
            is what keeps the document outline readable to anything that reads
            outlines rather than pixels.
          */}
          <Heading
            as="h1"
            size={{ base: '2xl', md: '3xl' }}
            color={surface.text}
            letterSpacing="-0.04em"
            lineHeight="1.05"
          >
            {section.title}
          </Heading>

          {section.subtitle && (
            <Text fontSize={{ base: 'lg', md: 'xl' }} color={surface.strong} mt="4">
              {section.subtitle}
            </Text>
          )}

          {section.description && (
            <Text color={surface.muted} mt="6" fontSize={{ base: 'md', md: 'lg' }} whiteSpace="pre-line">
              {section.description}
            </Text>
          )}
        </Box>

        <Box order={{ base: 2, lg: 2 }}>
          <ResponsiveMedia
            desktop={section.image_desktop}
            mobile={section.image_mobile}
            desktopDark={section.image_desktop_dark}
            mobileDark={section.image_mobile_dark}
            alt={section.title}
            ratio={4 / 3}
            eager
          />
        </Box>
      </SimpleGrid>

      {facts && facts.length > 0 && (
        <SimpleGrid
          columns={{ base: 2, md: 4 }}
          spacing={{ base: 5, md: 8 }}
          mt={{ base: 10, md: 16 }}
          pt={{ base: 8, md: 10 }}
          borderTop="1px solid"
          borderColor={surface.border}
        >
          {facts.map((fact) => (
            <Box key={fact.id}>
              <Text
                fontSize={{ base: '2xl', md: '4xl' }}
                fontWeight="800"
                color="brand.500"
                letterSpacing="-0.03em"
                lineHeight="1.1"
              >
                {fact.value}
              </Text>
              <Text fontSize="sm" color={surface.muted} mt="1">
                {fact.title}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
}
