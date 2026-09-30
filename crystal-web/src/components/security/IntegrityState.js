import React from 'react';
import { Box, Flex, Icon, Skeleton, Stack, Text } from '@chakra-ui/react';
import { FiImage, FiShield } from 'react-icons/fi';

import { STATES } from '@/security/verifySignature';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * WHAT A VISITOR SEES INSTEAD OF CONTENT THAT HAS NOT BEEN VERIFIED.
 *
 * Neutral on purpose. A visitor cannot do anything about a signature, and
 * "SHA-256 mismatch on /uploads/showcase/home.svg" on a homepage reads as the
 * site being broken - or worse, as an instruction. So the page says only that
 * this could not be verified (or cannot be shown right now), in the reader's
 * language, and the reason goes to the console where the person who can act
 * on it will look.
 *
 * CHECKING is a skeleton in the shape of what is coming, like every other
 * loading state on the site, so a page that verifies quickly never flashes a
 * message at all.
 */

/** A line or two of text that did not verify - a notice body, an answer. */
export function IntegrityMessage({ state, lines, compact, color }) {
  const t = useT();
  const surface = useSurface();

  if (state === STATES.CHECKING) {
    return (
      <Stack spacing="2" role="status" aria-busy="true" aria-label={t('components.security.checking')}>
        {Array.from({ length: lines || 2 }).map((ignored, index) => (
          <Skeleton key={index} height={compact ? '10px' : '12px'} width={index === 0 ? '85%' : '60%'} borderRadius="4px" />
        ))}
      </Stack>
    );
  }

  return (
    <Flex align="center" gap="2" data-gap="8" role="note" color={color || surface.muted}>
      <Icon as={FiShield} boxSize={compact ? '3' : '4'} flexShrink={0} aria-hidden="true" />
      <Text fontSize={compact ? 'xs' : 'sm'}>
        {state === STATES.ERROR
          ? t('components.security.unavailable')
          : t('components.security.unverified')}
      </Text>
    </Flex>
  );
}

/**
 * A picture that did not verify - or has not yet.
 *
 * It fills whatever box it is put in (the carousel's ratio box, a grid tile),
 * so the layout around it is the layout the picture would have had. No bytes
 * of the unverified file are ever behind it.
 */
export function ImagePlaceholder({ state, minH }) {
  const t = useT();
  const surface = useSurface();

  if (state === STATES.CHECKING) {
    return (
      <Skeleton
        position="absolute"
        top="0" right="0" bottom="0" left="0"
        minH={minH}
        startColor={surface.raised}
        endColor={surface.border}
        role="status"
        aria-busy="true"
        aria-label={t('components.security.checking')}
      />
    );
  }

  return (
    <Box position="absolute" top="0" right="0" bottom="0" left="0" minH={minH} bg={surface.raised}>
      {/* Four offsets rather than `inset`, which Chrome 72 does not know. */}
      <Flex
        position="absolute" top="0" right="0" bottom="0" left="0"
        direction="column" align="center" justify="center"
        px="4"
        color={surface.muted}
        role="img"
        aria-label={state === STATES.ERROR
          ? t('components.security.imageUnavailable')
          : t('components.security.imageUnverified')}
      >
        <Icon as={FiImage} boxSize="6" aria-hidden="true" />
        <Text fontSize="xs" mt="2" textAlign="center" aria-hidden="true">
          {state === STATES.ERROR
            ? t('components.security.imageUnavailable')
            : t('components.security.imageUnverified')}
        </Text>
      </Flex>
    </Box>
  );
}
