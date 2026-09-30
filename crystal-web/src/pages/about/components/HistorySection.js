import React, { useMemo, useState } from 'react';
import { Box, Flex, Text, Wrap, WrapItem } from '@chakra-ui/react';

import Prose from './Prose';
import SectionHeading from './SectionHeading';
import { chapterNumber } from '../constants';
import { useSurface } from '@/theme/tokens';

/**
 * 05 — WHERE WE CAME FROM.
 *
 * A YEAR AND WHAT HAPPENED IN IT. Each event used to carry a title and a
 * picture as well; both are gone. The description is the whole entry now, and
 * it keeps its line breaks, so several sentences read as several lines rather
 * than one run-on paragraph - the first line does the work the title did.
 *
 * TWO DIFFERENT ANSWERS, not one layout at two sizes.
 *
 *   DESKTOP is a year picker with a detail panel. Eleven years is too many to
 *   read at once and exactly right to choose from.
 *
 *   MOBILE is a vertical timeline, every year expanded. A picker on a phone
 *   hides ten of the eleven behind a control; scrolling down a column IS the
 *   timeline.
 *
 * EVENTS ARE GROUPED BY YEAR rather than assumed to be one each, so two things
 * that happened in the same year both show.
 */
export default function HistorySection({ section, events }) {
  const surface = useSurface();

  const years = useMemo(() => {
    const byYear = {};
    const order = [];

    (events || []).forEach((event) => {
      if (!byYear[event.year]) {
        byYear[event.year] = [];
        order.push(event.year);
      }
      byYear[event.year].push(event);
    });

    order.sort((a, b) => a - b);
    return order.map((year) => ({ year: year, events: byYear[year] }));
  }, [events]);

  const [selected, setSelected] = useState(null);

  if (!years.length) return null;

  /* Opens on the most recent year: where the company is now. */
  const active = years.filter((entry) => entry.year === selected)[0] || years[years.length - 1];

  return (
    <Box>
      {section && (
        <SectionHeading
          number={chapterNumber('history')}
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.subtitle}
        />
      )}

      {/* ------------------------------------------------ desktop picker */}
      <Box display={{ base: 'none', lg: 'block' }}>
        <Wrap spacing="0" mb="10" borderBottom="1px solid" borderColor={surface.border}>
          {years.map((entry) => {
            const isActive = entry.year === active.year;

            return (
              <WrapItem key={entry.year}>
                <Box
                  as="button"
                  type="button"
                  px="5"
                  pb="4"
                  position="relative"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => setSelected(entry.year)}
                >
                  <Text
                    fontSize="lg"
                    fontWeight={isActive ? '800' : '600'}
                    color={isActive ? 'brand.500' : surface.muted}
                    transition="color 160ms ease"
                  >
                    {entry.year}
                  </Text>

                  {/* The dot sits ON the rule, which makes the row a timeline. */}
                  <Box
                    position="absolute"
                    bottom="-5px"
                    left="50%"
                    transform="translateX(-50%)"
                    boxSize={isActive ? '10px' : '8px'}
                    borderRadius="full"
                    bg={isActive ? 'brand.500' : surface.border}
                    border="2px solid"
                    borderColor={surface.page}
                    transition="background 160ms ease, width 160ms ease, height 160ms ease"
                  />
                </Box>
              </WrapItem>
            );
          })}
        </Wrap>

        <Flex align="flex-start">
          <Text
            fontSize="6xl"
            fontWeight="800"
            color="brand.500"
            opacity={0.25}
            lineHeight="1"
            letterSpacing="-0.04em"
            aria-hidden="true"
            flexShrink={0}
            mr="12"
          >
            {active.year}
          </Text>

          <Box flex="1" minW="0" maxW="760px">
            {active.events.map((event, index) => (
              <Prose
                key={event.id}
                color={surface.text}
                fontSize="lg"
                lineHeight="1.8"
                mt={index === 0 ? '0' : '6'}
              >
                {event.description}
              </Prose>
            ))}
          </Box>
        </Flex>
      </Box>

      {/* ------------------------------------------------ mobile timeline */}
      <Box display={{ base: 'block', lg: 'none' }}>
        {years.map((entry, index) => (
          <Flex key={entry.year} align="stretch">
            {/* The rail: a dot per year and a line between them. Margin, not
                a flex gap - Chrome 72. */}
            <Flex direction="column" align="center" flexShrink={0} w="14px" mr="4">
              <Box boxSize="12px" borderRadius="full" bg="brand.500" mt="6px" />
              {index < years.length - 1 && (
                <Box w="2px" flex="1" bg={surface.border} />
              )}
            </Flex>

            <Box pb="8" minW="0" flex="1">
              <Text fontSize="lg" fontWeight="800" color="brand.500" lineHeight="1.2">
                {entry.year}
              </Text>

              {entry.events.map((event) => (
                <Prose key={event.id} fontSize="sm" color={surface.muted} mt="2" lineHeight="1.7">
                  {event.description}
                </Prose>
              ))}
            </Box>
          </Flex>
        ))}
      </Box>
    </Box>
  );
}
