import React, { useState } from 'react';
import { Box, Flex, Icon, IconButton, useBreakpointValue } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';

import CertificateCard from './CertificateCard';
import CertificateDialog from './CertificateDialog';
import useRotation from '../hooks/useRotation';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * CERTIFICATES AS A MOVING ROW: one at a time on a phone, four at a time on a
 * desktop, and always with more of them on their way in.
 *
 * WHY NOT THE GRID. Thirteen certificates as a wall is thirteen cards to
 * scroll past to reach the next chapter - on a phone that is most of a
 * screenful each. The carousel gives the set a fixed height and shows them in
 * turn, so the chapter stays the size of the claim it is making.
 *
 * WHY NOT HeroCarousel, which this page already uses (see SlotCarousel). That
 * one shows ONE slide at a time and cross-fades between them. The desktop
 * answer here is four visible at once with the rest queued behind, which is a
 * different thing: it SLIDES the row by one card, so the four on screen are
 * joined by the fifth while the first leaves. A cross-fade between groups of
 * four would replace the whole row at once and read as a flicker.
 *
 * IT MOVES BY ONE CARD, NOT BY ONE PAGE, and that is what makes the rest read
 * as candidates rather than as a slideshow: the reader can see the next
 * certificate arriving while four are still being read.
 *
 * WHEN IT STOPS is useRotation's business, and a dialog open over the row is
 * one of the reasons - a row that shifted underneath a dialog would put the
 * card back somewhere else when it closed.
 *
 * @param certificates  [{ id, name, issuer, year, image, ... }]
 * @param perView       how many to show at a time, per breakpoint
 * @param ariaLabel     what the row is, named by whoever is showing it -
 *                      the chapter heading above it, rather than a string
 *                      this file invents for both of its callers
 */

/** Long enough to read a certificate's name before the row moves. */
const INTERVAL = 4000;

const DEFAULT_PER_VIEW = { base: 1, sm: 2, md: 3, lg: 4 };

export default function CertificateCarousel({ certificates, perView, ariaLabel }) {
  const t = useT();
  const surface = useSurface();

  const list = certificates || [];

  /*
   * A NUMBER, not a breakpoint object, because the track's offset is
   * arithmetic: the row is shifted by one card's share of the width, and that
   * share is 100/shown per cent. Chakra's responsive props cannot express a
   * division, so the count has to be resolved here.
   */
  const shown = useBreakpointValue(perView || DEFAULT_PER_VIEW) || 1;

  const [open, setOpen] = useState(null);
  const [touched, setTouched] = useState(false);

  /*
   * THE POSITIONS ARE STOPS, NOT CARDS. The last stop puts the final card
   * flush with the right edge rather than scrolling into empty space, so with
   * four on screen a set of thirteen has ten stops - and the rotation counts
   * those.
   */
  const last = Math.max(0, list.length - shown);
  const rotation = useRotation(last + 1, INTERVAL, touched || !!open);

  if (!list.length) return null;

  /* One card's width as a percentage of the frame - see `shown`. */
  const share = 100 / shown;
  const first = Math.min(rotation.index, last);
  const scrolls = list.length > shown;

  const arrow = (direction, glyph, label) => (
    <IconButton
      aria-label={label}
      icon={<Icon as={glyph} boxSize="5" />}
      onClick={() => rotation.step(direction)}
      size="sm"
      variant="outline"
      borderColor={surface.border}
      color={surface.text}
      bg={surface.card}
      _hover={{ borderColor: 'brand.500', color: 'brand.500' }}
    />
  );

  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      onMouseEnter={() => setTouched(true)}
      onMouseLeave={() => setTouched(false)}
      /* Focus inside the row is somebody reading it with a keyboard. */
      onFocus={() => setTouched(true)}
      onBlur={() => setTouched(false)}
    >
      {/* The viewport: one frame wide, with the row inside it clipped. The
          negative margin cancels the cards' own gutters at both ends. */}
      <Box overflow="hidden" mx="-2">
        <Flex
          align="stretch"
          style={{
            /*
             * INLINE, because the offset is data - a percentage computed from
             * the stop and the number on screen - and as a style prop every
             * stop of every carousel would mint its own Emotion class.
             */
            transform: 'translateX(' + (-first * share) + '%)',
            transition: rotation.animated
              ? 'transform 420ms cubic-bezier(0.4, 0, 0.2, 1)'
              : 'none'
          }}
        >
          {list.map((certificate, index) => (
            <Box
              key={certificate.id}
              /* Three properties rather than the `flex` shorthand, and a
                 percentage rather than a gap: Chrome 72 has no flex gaps. */
              flexGrow={0}
              flexShrink={0}
              flexBasis={share + '%'}
              maxW={share + '%'}
              px="2"
              aria-hidden={index < first || index >= first + shown ? 'true' : undefined}
            >
              <CertificateCard
                certificate={certificate}
                onOpen={setOpen}
                /* The ones on screen when the chapter is reached. */
                eager={index < shown}
              />
            </Box>
          ))}
        </Flex>
      </Box>

      {scrolls && (
        <Flex align="center" justify="center" mt="5">
          {arrow(-1, ChevronLeftIcon, t('components.herocarousel.previousSlide'))}

          {/* One dot per stop, which is one per card except at the end. */}
          <Flex align="center" justify="center" mx="4" wrap="wrap" data-gap-wrap>
            {Array.from({ length: last + 1 }).map((unused, index) => (
              <Box
                key={index}
                as="button"
                type="button"
                aria-label={t('components.herocarousel.goToSlide', { number: index + 1 })}
                aria-current={index === first ? 'true' : undefined}
                mx="1"
                my="1"
                w={index === first ? '22px' : '8px'}
                h="8px"
                borderRadius="full"
                bg={index === first ? 'brand.500' : surface.border}
                transition="width 160ms ease, background 160ms ease"
                onClick={() => rotation.setIndex(index)}
              />
            ))}
          </Flex>

          {arrow(1, ChevronRightIcon, t('components.herocarousel.nextSlide'))}
        </Flex>
      )}

      <CertificateDialog certificate={open} onClose={() => setOpen(null)} />
    </Box>
  );
}
