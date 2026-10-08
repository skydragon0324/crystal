import React, { useMemo, useState } from 'react';
import { Box, Collapse, Flex, Icon, Text, Wrap, WrapItem } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

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
 * NEWEST FIRST, on both layouts. A reader arriving here wants to know where
 * the company IS, and then how it got there - so the list opens on the
 * current year and runs backwards. Told forwards, the eleventh entry is the
 * only one that answers the first question.
 *
 * TWO DIFFERENT ANSWERS, not one layout at two sizes.
 *
 *   DESKTOP is a year picker with a detail panel. Eleven years is too many to
 *   read at once and exactly right to choose from.
 *
 *   MOBILE is a timeline of FOLDED years: the current one open, the rest
 *   closed, one open at a time. Every year expanded was eleven passages of
 *   prose in a single column - a chapter that took longer to scroll past than
 *   the rest of the page together - and folding it turns that back into a
 *   list a thumb can cross. Unlike the desktop picker it still shows every
 *   year, which is the part of a timeline worth keeping on a phone.
 *
 * EVENTS ARE GROUPED BY YEAR rather than assumed to be one each, so two things
 * that happened in the same year both show.
 */

/** "Chosen, and chosen shut" - a state no year number can express. */
const CLOSED = 'none';

/** The prefix for a folded year's panel id, which its own button points at. */
const PANEL = 'history-year-';

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

    /* Newest first - see the note above. The content file may be in any order. */
    order.sort((a, b) => b - a);
    return order.map((year) => ({ year: year, events: byYear[year] }));
  }, [events]);

  const [selected, setSelected] = useState(null);

  /*
   * WHICH YEAR IS UNFOLDED ON A PHONE.
   *
   * `null` means nobody has chosen yet, which opens the newest year; CLOSED
   * means chosen and chosen shut. The two have to be distinguishable, because
   * folding the open year away is not the same as never having touched it -
   * and a year number cannot say either.
   */
  const [opened, setOpened] = useState(null);

  if (!years.length) return null;

  /* Both layouts open on the most recent year: where the company is now. */
  const active = years.filter((entry) => entry.year === selected)[0] || years[0];
  const openYear = opened === null ? years[0].year : opened;

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

      {/* ---------------------------------------------- mobile folded years */}
      <Box display={{ base: 'block', lg: 'none' }}>
        {years.map((entry, index) => {
          const isOpen = entry.year === openYear;
          const panelId = PANEL + entry.year;

          return (
            <Flex key={entry.year} align="stretch">
              {/* The rail: a dot per year and a line between them. Margin, not
                  a flex gap - Chrome 72. */}
              <Flex direction="column" align="center" flexShrink={0} w="14px" mr="4">
                <Box
                  boxSize="12px"
                  borderRadius="full"
                  /*
                   * The filled dot marks the year that is open, so the rail
                   * answers "which one am I reading" on its own - the fold
                   * state is not left to the colour of a heading.
                   */
                  bg={isOpen ? 'brand.500' : surface.border}
                  mt="14px"
                  flexShrink={0}
                  transition="background 160ms ease"
                />
                {index < years.length - 1 && (
                  <Box w="2px" flex="1" bg={surface.border} />
                )}
              </Flex>

              <Box
                minW="0"
                flex="1"
                borderBottom={index < years.length - 1 ? '1px solid' : undefined}
                borderColor={surface.border}
              >
                <Flex
                  as="button"
                  type="button"
                  w="100%"
                  align="center"
                  justify="space-between"
                  py="3"
                  textAlign="left"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  /*
                   * ONE YEAR AT A TIME: choosing a year replaces the open one
                   * rather than joining it, and choosing the open year folds
                   * it away. Holding a set of open years would be a different
                   * control, and would bring back the column this replaced.
                   */
                  onClick={() => setOpened(isOpen ? CLOSED : entry.year)}
                >
                  <Text
                    fontSize="lg"
                    fontWeight="800"
                    color={isOpen ? 'brand.500' : surface.text}
                    lineHeight="1.2"
                    transition="color 160ms ease"
                  >
                    {entry.year}
                  </Text>

                  <Icon
                    as={ChevronDownIcon}
                    boxSize="5"
                    color={surface.muted}
                    flexShrink={0}
                    transform={isOpen ? 'rotate(180deg)' : 'none'}
                    transition="transform 160ms ease"
                  />
                </Flex>

                {/*
                  * A FOLDED YEAR IS STILL ON THE PAGE. Collapse animates its
                  * height rather than unmounting it, so find-in-page reaches
                  * a year nobody has opened, and its prose is not rebuilt
                  * every time another year is chosen.
                  */}
                <Collapse in={isOpen} animateOpacity>
                  <Box id={panelId} pb="5">
                    {entry.events.map((event, at) => (
                      <Prose
                        key={event.id}
                        fontSize="sm"
                        color={surface.muted}
                        lineHeight="1.7"
                        mt={at === 0 ? '0' : '3'}
                      >
                        {event.description}
                      </Prose>
                    ))}
                  </Box>
                </Collapse>
              </Box>
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
}
