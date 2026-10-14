import React from 'react';
import { Box, Heading, SimpleGrid, Text } from '@chakra-ui/react';

import AboutScene from './AboutScene';
import overviewLayers, { OVERVIEW_MS } from '../overviewScene';
import { useSurface } from '@/theme/tokens';
import Prose from './Prose';
import { chapterNumber, REPEAT_CHAPTER_SCENES, SHOW_EYEBROWS } from '../constants';

/**
 * 01 — WHO WE ARE.
 *
 * The only chapter that carries the page's `h1`, and the only one whose
 * image loads eagerly: it is the thing above the fold, and lazy-loading the
 * first picture on a page is a blank rectangle in the one place nobody will
 * wait for.
 *
 * THREE PIECES IN ONE COLUMN, at every width: the heading, the picture, the
 * prose.
 *
 * THE PICTURE IS BETWEEN THE HEADING AND THE PROSE, and the order is the
 * argument. Not above the heading: a chapter that opens with a photograph and
 * no words has nothing to tell a reader what they are looking at, and the h1
 * is what the whole page opens with. Not below the prose, which is where it
 * used to be - that put a headline, a subtitle and a paragraph above the fold
 * before anything was shown.
 *
 * IT WAS TWO COLUMNS ON A DESKTOP, 55/45, with the picture beside both pieces
 * of text. That needed a Grid with named areas, because a picture landing
 * BETWEEN two blocks on a phone and BESIDE them on a desktop moves from one
 * column to another and `order` only reshuffles within one. One arrangement
 * needs none of that, so three stacked boxes replaced it.
 *
 * It suits what the picture became, too: in a 45% column a 16:5 scene was a
 * narrow strip, and across the full width it is the horizon it was drawn as.
 *
 * THE PROSE RUNS THE FULL WIDTH, as every description on this page now does.
 * It was capped at a reading measure, which on a desktop left it in the left
 * half of the band with nothing beside it.
 */
export default function OverviewSection({ section, facts }) {
  const surface = useSurface();
  if (!section) return null;

  return (
    <Box>
      <Box>
        <Box>
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

        {/* THE PICTURE, WITH MOTION IN IT - see AboutScene. */}
        <Box mt={{ base: 6, md: 8 }}>
          <AboutScene
            desktop={section.image_desktop}
            mobile={section.image_mobile}
            desktopDark={section.image_desktop_dark}
            mobileDark={section.image_mobile_dark}
            alt={section.title}
            /*
              WIDE, AND WIDER STILL ON A DESKTOP. The chapter opens with a sky:
              16:9 is a window on a phone and 16:5 is a horizon across a
              desktop, which is the shape the composition is drawn for.
            */
            ratio={{ base: 16 / 9, md: 16 / 5 }}
            layers={section.images}
            compose={overviewLayers}
            duration={OVERVIEW_MS}
            /* Said out loud rather than left to the engine's default. */
            loop={REPEAT_CHAPTER_SCENES}
          />
        </Box>

        <Box mt={{ base: 6, md: 8 }}>
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
      </Box>

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
