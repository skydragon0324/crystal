import React, { useMemo, useState } from 'react';
import { Box, Flex, Heading, Text, Wrap, WrapItem } from '@chakra-ui/react';

import ResponsiveMedia from './ResponsiveMedia';
import SectionHeading from './SectionHeading';
import { useSurface } from '@/theme/tokens';

/**
 * 04 — WHERE WE CAME FROM.
 *
 * TWO DIFFERENT ANSWERS, not one layout at two sizes.
 *
 *   DESKTOP is a year picker with a detail panel. Eleven years is too many to
 *   read at once and exactly right to choose from: the dots give the shape of
 *   the decade at a glance, and the panel gives one year properly.
 *
 *   MOBILE is a vertical timeline, every year expanded. A picker on a phone
 *   hides ten of the eleven behind a control, and the specification is
 *   explicit that horizontal year-scrolling must not be the only way to
 *   understand the timeline. Scrolling down a column IS the timeline.
 *
 * EVENTS ARE GROUPED BY YEAR rather than assumed to be one each. The backend
 * permits two events in a year, and a picker keyed on the year has to show
 * both rather than the first.
 */
export default function HistorySection({ section, events }) {
  const surface = useSurface();

  /* Grouped once, in order, so both layouts read the same structure. */
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

  /* Opens on the most recent year: where the company is now, not where it
     started, is the more useful first answer. */
  const active = years.filter((entry) => entry.year === selected)[0] || years[years.length - 1];

  return (
    <Box>
      {section && (
        <SectionHeading
          number="04"
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

                  {/* The dot sits ON the rule, which is what makes the row
                      read as a timeline rather than as a tab bar. */}
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

        {active.events.map((event) => (
          <Flex key={event.id} gap="12" data-gap="48" align="flex-start" mb="10">
            {event.image_desktop && (
              <Box flex="0 0 44%">
                <ResponsiveMedia
                  desktop={event.image_desktop}
                  mobile={event.image_mobile}
                  alt={event.title}
                  ratio={4 / 3}
                />
              </Box>
            )}

            <Box flex="1" minW="0">
              <Text
                fontSize="5xl"
                fontWeight="800"
                color="brand.500"
                opacity={0.25}
                lineHeight="1"
                letterSpacing="-0.04em"
                aria-hidden="true"
              >
                {active.year}
              </Text>
              <Heading as="h3" size="lg" color={surface.text} mt="3" letterSpacing="-0.02em">
                {event.title}
              </Heading>
              {event.description && (
                <Text color={surface.muted} mt="4" fontSize="lg">
                  {event.description}
                </Text>
              )}
            </Box>
          </Flex>
        ))}
      </Box>

      {/* ------------------------------------------------ mobile timeline */}
      <Box display={{ base: 'block', lg: 'none' }}>
        {years.map((entry, index) => (
          <Flex key={entry.year} gap="4" data-gap="16" align="stretch">
            {/* The rail: a dot per year and a line between them, stopping at
                the last one rather than trailing off the end. */}
            <Flex direction="column" align="center" flexShrink={0} w="14px">
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
                <Box key={event.id} mt="3">
                  <Heading as="h3" size="sm" color={surface.text}>
                    {event.title}
                  </Heading>
                  {event.description && (
                    <Text fontSize="sm" color={surface.muted} mt="2">
                      {event.description}
                    </Text>
                  )}
                  {/* A year with no picture renders as words, not as an
                      empty frame. */}
                  {event.image_mobile || event.image_desktop ? (
                    <Box mt="4">
                      <ResponsiveMedia
                        desktop={event.image_desktop}
                        mobile={event.image_mobile}
                        alt={event.title}
                        ratio={4 / 3}
                      />
                    </Box>
                  ) : null}
                </Box>
              ))}
            </Box>
          </Flex>
        ))}
      </Box>
    </Box>
  );
}
