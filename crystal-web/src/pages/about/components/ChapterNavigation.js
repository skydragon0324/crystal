import React from 'react';
import { Box, Flex, Icon, Text } from '@chakra-ui/react';
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi';

import { ABOUT_SECTIONS } from '../constants';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * WHAT CAME BEFORE, AND WHAT COMES NEXT.
 *
 * A reader who has finished a chapter is at the bottom of it, a long way from
 * either navigator - so the way on is offered where they already are.
 *
 * SECONDARY, and drawn like it: two quiet labels on a hairline, no cards, no
 * colour except on hover. The chapter above it is what the page is for.
 */
export default function ChapterNavigation({ id, onSelect }) {
  const t = useT();
  const surface = useSurface();

  const index = ABOUT_SECTIONS.findIndex((section) => section.id === id);
  if (index === -1) return null;

  const previous = index > 0 ? ABOUT_SECTIONS[index - 1] : null;
  const next = index < ABOUT_SECTIONS.length - 1 ? ABOUT_SECTIONS[index + 1] : null;

  return (
    <Flex
      align="center"
      justify="space-between"
      gap="4" data-gap="16"
      mt={{ base: 10, md: 14 }}
      pt="5"
      borderTop="1px solid"
      borderColor={surface.border}
    >
      {/* An empty box holds the right-hand slot in place on the first
          chapter, so "Businesses →" stays on the right where it belongs. */}
      {previous ? (
        <Flex
          as="button"
          type="button"
          align="center"
          gap="2" data-gap="8"
          color={surface.muted}
          _hover={{ color: 'brand.500' }}
          transition="color 160ms ease"
          onClick={() => onSelect(previous.id)}
        >
          <Icon as={FiArrowLeft} boxSize="4" />
          <Box textAlign="left">
            <Text fontSize="10px" fontWeight="700" letterSpacing="0.1em" opacity={0.7}>
              {previous.number}
            </Text>
            <Text fontSize="sm" fontWeight="600">{t(previous.label)}</Text>
          </Box>
        </Flex>
      ) : <Box />}

      {next ? (
        <Flex
          as="button"
          type="button"
          align="center"
          gap="2" data-gap="8"
          color={surface.muted}
          _hover={{ color: 'brand.500' }}
          transition="color 160ms ease"
          onClick={() => onSelect(next.id)}
        >
          <Box textAlign="right">
            <Text fontSize="10px" fontWeight="700" letterSpacing="0.1em" opacity={0.7}>
              {next.number}
            </Text>
            <Text fontSize="sm" fontWeight="600">{t(next.label)}</Text>
          </Box>
          <Icon as={FiArrowRight} boxSize="4" />
        </Flex>
      ) : <Box />}
    </Flex>
  );
}
