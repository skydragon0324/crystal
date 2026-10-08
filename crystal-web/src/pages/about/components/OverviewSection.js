import React from 'react';
import { Box, Grid, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import AboutScene from './AboutScene';
import { useSurface } from '@/theme/tokens';
import Prose from './Prose';
import { chapterNumber, SHOW_EYEBROWS } from '../constants';

/**
 * 01 — WHO WE ARE.
 *
 * The only chapter that carries the page's `h1`, and the only one whose
 * image loads eagerly: it is the thing above the fold, and lazy-loading the
 * first picture on a page is a blank rectangle in the one place nobody will
 * wait for.
 *
 * THREE PIECES, PLACED BY NAME: the heading, the picture, and the prose.
 *
 *   DESKTOP is two columns at 55/45. The heading and the prose stack in the
 *   wider one - the copy is the longer of the two - and the picture sits
 *   beside them both, spanning the pair.
 *
 *   MOBILE puts the picture BETWEEN the heading and the prose. Not above the
 *   heading: a chapter that opens with a photograph and no words has nothing
 *   to tell a reader what they are looking at, and the h1 is what the page
 *   opens with. Not below the prose either, which is where it used to be -
 *   that put a headline, a subtitle and a paragraph above the fold before
 *   anything was shown.
 *
 * `templateAreas` RATHER THAN `order`, and that is the whole reason this is a
 * Grid. The picture has to land between two pieces of text on a phone and
 * beside both of them on a desktop - which is a move from one column to
 * another, and `order` only reshuffles within one. Naming the areas says the
 * arrangement once per layout instead of a flag on each child.
 */
export default function OverviewSection({ section, facts }) {
  const surface = useSurface();
  if (!section) return null;

  return (
    <Box>
      <Grid
        templateColumns={{ base: '1fr', lg: '55fr 45fr' }}
        templateAreas={{
          base: '"head" "picture" "body"',
          lg: '"head picture" "body picture"'
        }}
        /*
         * Separate row and column gaps: the column gap is the space between
         * the copy and the photograph, and the row gap is the space between a
         * headline and the sentence under it. One number cannot be both.
         */
        gridColumnGap={{ lg: 14 }}
        gridRowGap={{ base: 6, lg: 4 }}
      >
        <Box gridArea="head">
          {SHOW_EYEBROWS && section.eyebrow && (
            <Text
              fontSize="xs"
              fontWeight="800"
              letterSpacing="0.14em"
              textTransform="uppercase"
              color="brand.500"
              mb="4"
            >
              <Text as="span" aria-hidden="true" opacity={0.6} mr="2">{chapterNumber('overview')}</Text>
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
        </Box>

        {/*
          * THE PICTURE, WITH MOTION IN IT - see AboutScene. It spans both text
          * rows on a desktop, so it is centred against the pair rather than
          * tied to the height of either.
          */}
        <Box gridArea="picture" alignSelf="center">
          <AboutScene
            desktop={section.image_desktop}
            mobile={section.image_mobile}
            desktopDark={section.image_desktop_dark}
            mobileDark={section.image_mobile_dark}
            alt={section.title}
            ratio={4 / 3}
            /* Three files in this slot, so this chapter is a composition - see
               images.js. */
            layers={section.images}
          />
        </Box>

        <Box gridArea="body">
          {section.subtitle && (
            <Text fontSize={{ base: 'lg', md: 'xl' }} color={surface.strong}>
              {section.subtitle}
            </Text>
          )}

          {section.description && (
            <Prose color={surface.muted} mt="6" fontSize={{ base: 'md', md: 'lg' }}>
              {section.description}
            </Prose>
          )}
        </Box>
      </Grid>

      {facts && facts.length > 0 && (
        <SimpleGrid
          /* Three milestones - the year, then the name the company took. */
          columns={3}
          spacing={{ base: 5, md: 8 }}
          mt={{ base: 10, md: 16 }}
          pt={{ base: 8, md: 10 }}
          borderTop="1px solid"
          borderColor={surface.border}
        >
          {facts.map((fact) => (
            /* Centred: three short figures in a row read as a set when they
               share an axis, and ragged left edges under uneven numbers do
               not give them one. */
            <Box key={fact.id} textAlign="center">
              <Text
                fontSize={{ base: 'xl', sm: '2xl', md: '4xl' }}
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
