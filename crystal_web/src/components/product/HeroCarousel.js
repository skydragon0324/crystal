import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, IconButton, Image, Link, Tooltip } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The storefront carousel, built to the mi.com/global pattern.
 *
 * ONE CLOCK, NOT TWO
 * ------------------
 * The indicator for the current slide fills left to right over exactly the
 * time that slide is shown, and the deck advances when that fill completes.
 * The obvious build - a CSS animation for the bar and a setInterval for the
 * advance - is two clocks that drift apart, and every pause and resume widens
 * the gap until the bar visibly finishes early or hangs full.
 *
 * So there is one clock: this animation. The advance is driven from its
 * `animationend`, and pausing is `animation-play-state: paused`, which stops
 * the bar and the advance together because the event simply never fires.
 * Nothing to keep in sync, and a pause is frame accurate.
 *
 * WHAT IT DOES
 * ------------
 *   - slides move as a TRACK rather than cross-fading
 *   - one indicator per slide; the active one is a progress bar showing how
 *     much of that slide's time is left
 *   - a play / pause button at the end of the indicator row, which is the
 *     visitor's own decision and outranks every automatic pause below
 *   - arrows on hover, keyboard arrows when focused, swipe on touch
 *   - pauses on hover and while the tab is in the background, and does not
 *     autoplay at all for somebody who asked for reduced motion
 *
 * THE TRACK IS NOT A CHAKRA AspectRatio. AspectRatio forces
 * `overflow:hidden; position:absolute; display:flex; justify-content:center`
 * onto its direct child at a specificity the child cannot beat, which centres
 * an overflowing track and lands every translateX between two slides. Hence
 * the padding-bottom box.
 *
 * CHROME 72: no flexbox `gap` here. The indicator row spaces itself with
 * margins, because a `gap` this browser drops silently is an indicator row
 * whose pills touch.
 */

const SWIPE_THRESHOLD = 45;

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** An absolute url leaves the site; anything else is a route inside it. */
function isExternal(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

export default function HeroCarousel({
  slides, interval, ratio, borderRadius, showArrows, autoPlay, ariaLabel, objectFit
}) {
  const t = useT();

  const surface = useSurface();
  const deck = useMemo(() => slides || [], [slides]);
  const count = deck.length;
  const every = interval || 6000;

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay === undefined ? true : !!autoPlay);
  const [hovering, setHovering] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);

  const reduced = useMemo(prefersReducedMotion, []);
  const touchStart = useRef(null);

  /*
   * A single slide is a PICTURE, not a carousel: no timer, no indicators, no
   * arrows. Every hook above and below still runs - the guards are on
   * `count` rather than on an early return, because hooks cannot be skipped.
   */
  const isDeck = count > 1;

  /** Whether a timed fill exists at all. */
  const animatable = isDeck && !reduced;

  /*
   * Whether that fill is currently ticking.
   *
   * Hover and tab-visibility SUSPEND it and hand the elapsed time back on
   * resume. The play/pause button is a decision rather than a suspension, so
   * it is checked first: a visitor who paused the deck and then moved the
   * pointer away must not find it running again.
   */
  const running = animatable && playing && !hovering && !pageHidden;

  const goTo = useCallback((next) => {
    // Modulo both ways, so `index - 1` from the first slide wraps to the last
    // rather than to -1.
    setIndex((current) => (count ? (((next(current) % count) + count) % count) : 0));
  }, [count]);

  const goNext = useCallback(() => goTo((current) => current + 1), [goTo]);
  const goPrev = useCallback(() => goTo((current) => current - 1), [goTo]);

  // A deck that shrinks - a filter, a smaller device set - must not leave the
  // index pointing past the end.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => setPageHidden(Boolean(document.hidden));
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const onKeyDown = (event) => {
    if (!isDeck) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goNext(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goPrev(); }
  };

  const onTouchStart = (event) => { touchStart.current = event.touches[0].clientX; };

  const onTouchEnd = (event) => {
    if (touchStart.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) goNext(); else goPrev();
  };

  if (!count) return null;

  const arrowStyle = {
    position: 'absolute',
    top: '50%',
    borderRadius: 'full',
    color: 'white',
    bg: 'blackAlpha.400',
    _hover: { bg: 'blackAlpha.600' },
    _active: { bg: 'blackAlpha.600' },
    // Revealed by hover on a pointer device, but ALWAYS present on touch,
    // where there is no hover to reveal them and a swipe is not discoverable
    // on its own.
    opacity: { base: 1, md: 0 },
    transition: 'opacity .2s ease'
  };

  const renderIndicator = (slide, position) => {
    const isActive = position === index;

    return (
      <Box
        key={'ind-' + (slide.id || position)}
        as="button"
        type="button"
        /*
         * ONE SENTENCE WITH A NUMBER IN IT, not a word glued to a number.
         * Concatenation fixes English word order onto every language; a
         * placeholder lets each put the number where its grammar wants it.
         */
        aria-label={t('components.herocarousel.goToSlide', { number: position + 1 })}
        aria-current={isActive}
        onClick={() => goTo(() => position)}
        // Margin rather than a flex gap: see the Chrome 72 note at the top.
        mx="4px"
        h="14px"
        display="flex"
        alignItems="center"
        _focusVisible={{ outline: '2px solid white', outlineOffset: '2px' }}
      >
        {/* The active slide's track is lifted a shade so the position is
            readable even when the fill is empty - paused on arrival, or
            autoplay switched off. */}
        <Box
          w={isActive ? { base: '28px', md: '44px' } : '18px'}
          h="3px"
          borderRadius="999px"
          bg={isActive ? 'whiteAlpha.600' : 'whiteAlpha.400'}
          overflow="hidden"
          transition="width 220ms ease"
        >
          {isActive && (
            <Box
              /*
               * `key` is the slide index and NOTHING ELSE.
               *
               * Remounting is how the animation restarts - re-assigning the
               * same animation to a live element does not replay it - but
               * keying on the paused state too would throw the elapsed time
               * away every time the pointer crossed the carousel.
               */
              key={index}
              h="100%"
              w="100%"
              bg="white"
              borderRadius="999px"
              // transform-origin left + scaleX is what makes this a progress
              // bar rather than a growing box: it animates on the compositor,
              // so a six second fill costs nothing per frame.
              transformOrigin="left center"
              transform={animatable ? 'scaleX(0)' : 'scaleX(1)'}
              sx={animatable ? {
                animation: 'crystalHeroFill ' + every + 'ms linear forwards',
                animationPlayState: running ? 'running' : 'paused',
                '@keyframes crystalHeroFill': {
                  from: { transform: 'scaleX(0)' },
                  to: { transform: 'scaleX(1)' }
                }
              } : undefined}
              onAnimationEnd={animatable ? goNext : undefined}
            />
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Box
      position="relative"
      overflow="hidden"
      borderRadius={borderRadius === undefined ? '16px' : borderRadius}
      bg={surface.raised}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel || 'Featured'}
      tabIndex={0}
      outline="none"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      sx={{ '&:hover .crystal-hero-arrow': { opacity: 1 } }}
    >
      <Box position="relative" pb={ratio || '42%'}>
        <Flex
          position="absolute"
          insetX="0" insetY="0"
          w={count * 100 + '%'}
          transform={'translateX(-' + (index * 100) / count + '%)'}
          transition={reduced ? undefined : 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)'}
          willChange="transform"
        >
          {deck.map((slide, position) => (
            <Box
              key={slide.id || position}
              w={100 / count + '%'}
              h="100%"
              position="relative"
              role="group"
              aria-roledescription="slide"
              aria-label={(position + 1) + ' / ' + count}
              // A slide that is off screen is still in the DOM for the track
              // to move, but it is not content the page is offering now.
              aria-hidden={position !== index}
            >
              <Image
                src={fileUrl(slide.path || slide.url)}
                alt={slide.altText || slide.alt || ''}
                w="100%"
                h="100%"
                /*
                 * "cover" for a banner, which is what this mostly shows.
                 * A product page passes "contain": those are catalogue
                 * shots of a whole object, and cropping a phone to fill
                 * the frame is how the corners of it disappear.
                 */
                objectFit={objectFit || 'cover'}
                // The first slide is above the fold on every page that uses
                // this; lazy-loading it delays the largest paint.
                loading={position === 0 ? 'eager' : 'lazy'}
              />
              {slide.content && (
                <Box position="absolute" insetX="0" insetY="0">
                  {slide.content}
                </Box>
              )}

              {/*
                An ADVERTISEMENT that can be followed.

                Only the section hero carries a link - a studio shot and an
                article figure have nowhere to point - so this is drawn only
                when there is one. It covers the slide rather than sitting
                inside it, because the whole picture is the advertisement.

                Off-screen slides are not tab stops: keyboard focus walking
                into a slide nobody can see is the classic carousel trap.
              */}
              {slide.linkUrl && (
                <Link
                  // An absolute url leaves the site and needs a real anchor;
                  // anything else is a route and must not reload the app.
                  as={isExternal(slide.linkUrl) ? undefined : RouterLink}
                  href={isExternal(slide.linkUrl) ? slide.linkUrl : undefined}
                  to={isExternal(slide.linkUrl) ? undefined : slide.linkUrl}
                  position="absolute"
                  insetX="0" insetY="0"
                  aria-label={slide.altText || slide.alt || undefined}
                  tabIndex={position === index ? 0 : -1}
                />
              )}
            </Box>
          ))}
        </Flex>
      </Box>

      {showArrows !== false && isDeck && (
        <>
          <IconButton
            className="crystal-hero-arrow"
            aria-label={t('components.herocarousel.previousSlide')}
            icon={<ChevronLeftIcon boxSize="6" />}
            left="3"
            transform="translateY(-50%)"
            onClick={goPrev}
            {...arrowStyle}
          />
          <IconButton
            className="crystal-hero-arrow"
            aria-label={t('components.herocarousel.nextSlide')}
            icon={<ChevronRightIcon boxSize="6" />}
            right="3"
            transform="translateY(-50%)"
            onClick={goNext}
            {...arrowStyle}
          />
        </>
      )}

      {isDeck && (
        <Flex
          position="absolute"
          bottom={{ base: '12px', md: '18px' }}
          left="50%"
          transform="translateX(-50%)"
          align="center"
          px="10px"
          py="7px"
          borderRadius="999px"
          bg="blackAlpha.400"
          sx={{ backdropFilter: 'blur(6px)' }}
        >
          {deck.map(renderIndicator)}

          {/*
            The play / pause control sits at the END OF THE INDICATOR ROW, as
            on mi.com - it reads as the last item of the same instrument
            rather than as a separate button parked nearby.
          */}
          <Box w="1px" h="14px" bg="whiteAlpha.400" mx="6px" />

          {/*
            A TOOLTIP RATHER THAN `title`: the native one is drawn by the
            operating system in its own font, which is the one thing on this
            carousel that cannot be styled.
          */}
          <Tooltip
            label={playing
              ? t('components.herocarousel.pauseAutoplay')
              : t('components.herocarousel.playAutoplay')}
            placement="top"
            openDelay={350}
            hasArrow
          >
          <Box
            as="button"
            type="button"
            aria-label={playing
              ? t('components.herocarousel.pauseAutoplay')
              : t('components.herocarousel.playAutoplay')}
            aria-pressed={!playing}
            onClick={() => setPlaying((current) => !current)}
            w="20px"
            h="20px"
            ml="2px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="white"
            opacity={0.9}
            _hover={{ opacity: 1 }}
            _focusVisible={{ outline: '2px solid white', outlineOffset: '2px' }}
          >
            {playing ? (
              /*
               * Two bars and a triangle, drawn inline. An icon dependency for
               * two 10px glyphs is not worth it, and these scale with the
               * button rather than with a font.
               */
              <Flex align="center">
                <Box w="3px" h="11px" bg="currentColor" borderRadius="1px" />
                <Box w="3px" h="11px" bg="currentColor" borderRadius="1px" ml="3px" />
              </Flex>
            ) : (
              <Box
                w="0"
                h="0"
                ml="2px"
                borderTop="6px solid transparent"
                borderBottom="6px solid transparent"
                borderLeft="10px solid currentColor"
              />
            )}
          </Box>
          </Tooltip>
        </Flex>
      )}
    </Box>
  );
}
