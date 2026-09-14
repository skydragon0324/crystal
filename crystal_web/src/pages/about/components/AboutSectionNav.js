import React from 'react';
import { Box, Container, Flex, Text } from '@chakra-ui/react';

import { ABOUT_SECTIONS, NAV_HEIGHT } from '../constants';
import { useSurface } from '@/theme/tokens';
import { HEADER_HEIGHT } from '@/components/layout/siteNav';
import { useT } from '@/i18n';

/**
 * THE CHAPTER RAIL, on a screen wide enough to show ten of them.
 *
 * It sits under the site header and stays there. Sticky from the start rather
 * than after a scroll threshold: a bar that appears when you pass an
 * invisible line is a bar that is missing exactly when somebody first reaches
 * for it, and pinning it under a header that is already sticky costs nothing
 * because the header declares its own height.
 *
 * IT IS 56px, once. Two stacked bars is already most of a phone's usable
 * height, so this one carries labels and nothing else - no heading, no
 * description, no second row.
 *
 * THE ACTIVE ITEM IS NOT ONLY BLUE. Colour alone cannot be the signal, so the
 * active chapter carries an underline and a heavier weight as well, and
 * `aria-current` says it in words for anything not looking at the page.
 */
export default function AboutSectionNav({ active, onSelect }) {
  const t = useT();
  const surface = useSurface();

  return (
    <Box
      as="nav"
      aria-label={t('common.aboutCrystalSections')}
      display={{ base: 'none', md: 'block' }}
      position="sticky"
      top={HEADER_HEIGHT}
      zIndex="1100"
      h={NAV_HEIGHT.md}
      bg={surface.card}
      borderBottom="1px solid"
      borderColor={surface.border}
      boxShadow={surface.shadow}
    >
      <Container maxW="container.site" px={{ base: 4, md: 6 }} h="100%">
        {/*
          It SCROLLS rather than wraps. Ten labels do not fit on a tablet, and
          a bar that wraps to two lines doubles the height of the one piece of
          chrome that has to stay small. The scrollbar itself is hidden - the
          overflow is a tablet affordance, not a control.
        */}
        <Flex
          align="center"
          h="100%"
          gap="1" data-gap="4"
          overflowX="auto"
          sx={{
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' }
          }}
        >
          {ABOUT_SECTIONS.map((section) => {
            const isActive = section.id === active;

            return (
              <Box
                key={section.id}
                as="button"
                type="button"
                aria-current={isActive ? 'true' : undefined}
                flexShrink={0}
                px="3"
                h="100%"
                position="relative"
                color={isActive ? 'brand.500' : surface.muted}
                fontWeight={isActive ? '700' : '500'}
                fontSize="sm"
                whiteSpace="nowrap"
                transition="color 160ms ease"
                _hover={{ color: isActive ? 'brand.500' : surface.text }}
                onClick={() => onSelect(section.id)}
              >
                <Flex align="baseline" gap="1.5" data-gap="6">
                  <Text
                    as="span"
                    aria-hidden="true"
                    fontSize="10px"
                    fontWeight="700"
                    opacity={isActive ? 0.8 : 0.5}
                  >
                    {section.number}
                  </Text>
                  {t(section.label)}
                </Flex>

                {/* The underline is a sibling rather than a border, so the
                    label does not shift by a pixel when it appears. */}
                <Box
                  position="absolute"
                  left="3"
                  right="3"
                  bottom="0"
                  h="2px"
                  borderTopRadius="2px"
                  bg={isActive ? 'brand.500' : 'transparent'}
                  transition="background 160ms ease"
                />
              </Box>
            );
          })}
        </Flex>
      </Container>
    </Box>
  );
}
