import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, IconButton, Text, useColorModeValue } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { keyframes } from '@emotion/react';
import { NavLink } from 'react-router-dom';
import AppImage from 'components/Frame/AppImage';
import { getLangText } from 'lang/lang';

/* ------------------------------------------------------------------ *
 * One clock, not two
 *
 * The indicator for the current slide fills left to right over exactly
 * the time that slide is shown, and the deck advances when that fill
 * completes. The obvious build - a CSS animation for the bar and a
 * setTimeout for the advance - is two clocks that drift apart, and every
 * pause and resume widens the gap until the bar visibly finishes early
 * or hangs full.
 *
 * So there is one clock: this animation. The advance is driven from its
 * `animationend`, and pausing is `animation-play-state: paused`, which
 * stops the bar and the advance together because the event simply never
 * fires. Nothing to keep in sync, and a pause is frame-accurate.
 * ------------------------------------------------------------------ */
const fillBar = keyframes`
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
`;

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const SWIPE_THRESHOLD = 45;

const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Storefront hero carousel, built to the mi.com/global pattern.
 *
 * What it does
 * ------------
 *   - full-bleed slides that move as a track, not a cross-fade
 *   - one indicator per slide; the active one is a progress bar showing
 *     how much of that slide's time is left
 *   - a play / pause button at the end of the indicator row
 *   - arrows that appear on hover, keyboard arrows when focused,
 *     swipe on touch
 *   - pauses on hover and while the tab is in the background, and does
 *     not autoplay at all for a visitor who asked for reduced motion
 *
 * Slides
 * ------
 * [{
 *   key,
 *   image, mock,        passed straight to AppImage, so a slide whose
 *                       upload is missing still shows a picture
 *   alt,
 *   eyebrow, title, subtitle,
 *   cta: { label, to }  `to` is a router path; `href` an external link
 *   align: 'left' | 'center',
 *   tone:  'light' | 'dark'   colour of the text ON the image
 * }]
 */
const HeroCarousel = (props) => {
  const {
    slides = [],
    interval = 5000,
    autoPlay = true,
    height,
    borderRadius = { base: '0px', md: '24px' },
    ariaLabel,
  } = props;

  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [hovering, setHovering] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);

  const reduced = useMemo(prefersReducedMotion, []);
  const touchStartX = useRef(null);

  const trackBg = useColorModeValue('secondaryGray.300', 'navy.800');
  const barTrack = 'rgba(255, 255, 255, 0.35)';
  const barFill = 'rgba(255, 255, 255, 0.95)';
  const controlBg = 'rgba(0, 0, 0, 0.28)';
  const controlHoverBg = 'rgba(0, 0, 0, 0.45)';

  /*
   * A single slide is a picture, not a carousel: no timer, no indicators,
   * no arrows. Everything below still runs, so the guards are on `count`
   * rather than an early return - hooks cannot be skipped.
   */
  const isDeck = count > 1;

  // Whether a timed fill exists at all. A single slide has nothing to
  // advance to, and a visitor who asked for reduced motion gets a deck
  // that only ever moves when they move it.
  const animatable = isDeck && !reduced;

  // Whether that fill is currently ticking. Hover and tab-visibility
  // suspend it and hand back the elapsed time on resume; the play/pause
  // button is the visitor's own decision and outranks both.
  const running = animatable && playing && !hovering && !pageHidden;

  const goTo = useCallback((next) => {
    if (!count) return;
    // Modulo both ways so `index - 1` from the first slide wraps to the
    // last rather than to -1.
    setIndex(((next % count) + count) % count);
  }, [count]);

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  /* ---------------- suspend in a background tab ---------------- */

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const onVisibility = () => setPageHidden(!!document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /* ---------------- input ---------------- */

  const onKeyDown = (event) => {
    if (!isDeck) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goNext(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goPrev(); }
  };

  const onTouchStart = (event) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const onTouchEnd = (event) => {
    if (touchStartX.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) goNext(); else goPrev();
  };

  if (!count) return null;

  /* ---------------- slide ---------------- */

  const renderSlide = (slide, slideIndex) => {
    const isActive = slideIndex === index;
    const tone = slide.tone === 'dark' ? 'dark' : 'light';
    const inkColor = tone === 'dark' ? 'secondaryGray.900' : 'white';
    const alignLeft = slide.align !== 'center';

    return (
      <Box
        key={slide.key || `slide-${slideIndex}`}
        position="relative"
        flex="0 0 100%"
        w="100%"
        h="100%"
        // A slide that is off screen is still in the DOM for the track to
        // move, but it is not content the page is offering right now.
        aria-hidden={!isActive}
        role="group"
        aria-roledescription="slide"
        aria-label={`${slideIndex + 1} / ${count}`}
      >
        {/* `fill`, not a height: the slide's height comes from the deck,
            and an image asked to be 100% of a box that is sizing itself
            from its content resolves to nothing. */}
        <AppImage
          fill
          src={slide.image}
          mock={slide.mock}
          label={slide.alt || slide.title}
          objectFit="cover"
          skeleton={false}
        />

        {/*
          A scrim, not a flat overlay. White copy over a photograph is only
          legible if the area under the copy is darkened, and darkening the
          whole frame washes the product out - so the gradient is strongest
          exactly where the text sits and clears by the middle.
        */}
        {(slide.title || slide.eyebrow || slide.subtitle) ? (
          <Box
            position="absolute"
            inset="0"
            bgGradient={
              tone === 'dark'
                ? 'linear(to-r, whiteAlpha.800, whiteAlpha.500 45%, transparent 70%)'
                : alignLeft
                  ? 'linear(to-r, blackAlpha.700, blackAlpha.400 45%, transparent 72%)'
                  : 'linear(to-b, blackAlpha.500, blackAlpha.100 40%, blackAlpha.600)'
            }
            pointerEvents="none"
          />
        ) : null}

        <Flex
          position="absolute"
          inset="0"
          direction="column"
          justify="center"
          align={alignLeft ? 'flex-start' : 'center'}
          textAlign={alignLeft ? 'left' : 'center'}
          px={{ base: '24px', md: '56px', lg: '72px' }}
          pb={{ base: '64px', md: '72px' }}
        >
          <Box maxW={{ base: '100%', md: '52%' }}>
            {slide.eyebrow ? (
              <Text
                // Keyed on the index so the copy replays its entrance on
                // every arrival, including a wrap back to the first slide.
                key={`eyebrow-${index}`}
                animation={isActive && !reduced ? `${fadeUp} .5s ease both` : undefined}
                fontSize={{ base: 'xs', md: 'sm' }}
                fontWeight="700"
                letterSpacing="1.4px"
                textTransform="uppercase"
                color={inkColor}
                opacity={0.85}
                mb="10px"
              >
                {slide.eyebrow}
              </Text>
            ) : null}

            {slide.title ? (
              <Text
                key={`title-${index}`}
                animation={isActive && !reduced ? `${fadeUp} .5s ease .06s both` : undefined}
                fontSize={{ base: '28px', md: '42px', lg: '52px' }}
                lineHeight="1.15"
                fontWeight="800"
                color={inkColor}
                mb="12px"
              >
                {slide.title}
              </Text>
            ) : null}

            {slide.subtitle ? (
              <Text
                key={`subtitle-${index}`}
                animation={isActive && !reduced ? `${fadeUp} .5s ease .12s both` : undefined}
                fontSize={{ base: 'sm', md: 'lg' }}
                fontWeight="500"
                color={inkColor}
                opacity={0.9}
                mb="20px"
              >
                {slide.subtitle}
              </Text>
            ) : null}

            {slide.cta && slide.cta.label ? (
              <Box
                key={`cta-${index}`}
                animation={isActive && !reduced ? `${fadeUp} .5s ease .18s both` : undefined}
              >
                <Button
                  as={slide.cta.to ? NavLink : 'a'}
                  to={slide.cta.to}
                  href={slide.cta.href}
                  variant="brand"
                  borderRadius="30px"
                  px="28px"
                  h="46px"
                  fontSize="sm"
                  fontWeight="700"
                  // An off-screen slide's button must not be a tab stop,
                  // or keyboard focus walks into a slide nobody can see.
                  tabIndex={isActive ? 0 : -1}
                >
                  {slide.cta.label}
                </Button>
              </Box>
            ) : null}
          </Box>
        </Flex>
      </Box>
    );
  };

  /* ---------------- indicators ---------------- */

  const renderIndicator = (slide, slideIndex) => {
    const isActive = slideIndex === index;

    return (
      <Box
        key={`ind-${slide.key || slideIndex}`}
        as="button"
        type="button"
        aria-label={getLangText('CAROUSEL_GOTO', { index: slideIndex + 1 })}
        aria-current={isActive}
        onClick={() => goTo(slideIndex)}
        position="relative"
        h="14px"
        px="0"
        w={{ base: '28px', md: '44px' }}
        display="flex"
        alignItems="center"
        _focusVisible={{ outline: '2px solid white', outlineOffset: '2px' }}
      >
        {/*
          The active slide's track is lifted a shade so the position is
          readable even when the fill is empty - paused on arrival, or
          autoplay switched off entirely.
        */}
        <Box
          w="100%"
          h="3px"
          borderRadius="3px"
          bg={isActive ? 'rgba(255, 255, 255, 0.55)' : barTrack}
          overflow="hidden"
        >
          {/*
            transform-origin left + scaleX is what makes this a progress
            bar rather than a growing box: it animates on the compositor,
            so a five-second fill costs nothing per frame.

            `key` is the slide index and nothing else. Remounting is how
            the animation restarts - re-assigning the same animation to a
            live element does not replay it - but keying on the paused
            state too would throw the elapsed time away every time the
            pointer crossed the carousel. Pausing is a play-state change
            on this same element, so the bar holds exactly where it was
            and resumes from there.
          */}
          <Box
            key={`fill-${index}`}
            h="100%"
            w="100%"
            bg={barFill}
            borderRadius="3px"
            transformOrigin="left center"
            transform={isActive && !animatable ? 'scaleX(1)' : 'scaleX(0)'}
            animation={isActive && animatable ? `${fillBar} ${interval}ms linear forwards` : undefined}
            style={isActive && animatable ? { animationPlayState: running ? 'running' : 'paused' } : undefined}
            onAnimationEnd={isActive ? goNext : undefined}
          />
        </Box>
      </Box>
    );
  };

  const playPauseLabel = getLangText(playing ? 'CAROUSEL_PAUSE' : 'CAROUSEL_PLAY');

  return (
    <Box
      position="relative"
      w="100%"
      h={height || { base: '380px', md: '440px', lg: '520px' }}
      bg={trackBg}
      borderRadius={borderRadius}
      overflow="hidden"
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel || getLangText('CAROUSEL_LABEL')}
      tabIndex={0}
      outline="none"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      sx={{ '&:hover .hero-arrow': { opacity: 1 } }}
    >
      {/* the track */}
      <Flex
        h="100%"
        w="100%"
        transform={`translateX(-${index * 100}%)`}
        transition={reduced ? undefined : 'transform .6s cubic-bezier(.22,.61,.36,1)'}
        willChange="transform"
      >
        {slides.map(renderSlide)}
      </Flex>

      {isDeck ? (
        <>
          <IconButton
            className="hero-arrow"
            aria-label={getLangText('CAROUSEL_PREV')}
            icon={<ChevronLeftIcon w="24px" h="24px" />}
            onClick={goPrev}
            position="absolute"
            left={{ base: '8px', md: '20px' }}
            top="50%"
            transform="translateY(-50%)"
            borderRadius="50%"
            size="lg"
            color="white"
            bg={controlBg}
            _hover={{ bg: controlHoverBg }}
            _active={{ bg: controlHoverBg }}
            // Hidden until hover on a pointer device, but always present
            // for touch, where there is no hover to reveal it and a swipe
            // is not discoverable on its own.
            opacity={{ base: 1, md: 0 }}
            transition="opacity .2s ease"
          />
          <IconButton
            className="hero-arrow"
            aria-label={getLangText('CAROUSEL_NEXT')}
            icon={<ChevronRightIcon w="24px" h="24px" />}
            onClick={goNext}
            position="absolute"
            right={{ base: '8px', md: '20px' }}
            top="50%"
            transform="translateY(-50%)"
            borderRadius="50%"
            size="lg"
            color="white"
            bg={controlBg}
            _hover={{ bg: controlHoverBg }}
            _active={{ bg: controlHoverBg }}
            opacity={{ base: 1, md: 0 }}
            transition="opacity .2s ease"
          />

          <Flex
            position="absolute"
            bottom={{ base: '18px', md: '26px' }}
            left="50%"
            transform="translateX(-50%)"
            align="center"
            gridGap="10px"
            px="14px"
            py="8px"
            borderRadius="20px"
            bg="rgba(0, 0, 0, 0.22)"
            backdropFilter="blur(6px)"
          >
            {slides.map(renderIndicator)}

            {/*
              The play / pause control sits at the end of the indicator
              row, as on mi.com - it reads as the last item of the same
              instrument rather than a separate button parked nearby.
            */}
            <Box w="1px" h="14px" bg="rgba(255,255,255,0.35)" mx="2px" />

            <Box
              as="button"
              type="button"
              aria-label={playPauseLabel}
              title={playPauseLabel}
              aria-pressed={!playing}
              onClick={() => setPlaying((current) => !current)}
              w="20px"
              h="20px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              color="white"
              opacity={0.9}
              _hover={{ opacity: 1 }}
              _focusVisible={{ outline: '2px solid white', outlineOffset: '2px' }}
            >
              {playing ? (
                // Two bars and a triangle drawn inline: an icon set
                // dependency for two 10px glyphs is not worth it, and
                // these scale with the button rather than a font.
                <Flex align="center" gridGap="3px">
                  <Box w="3px" h="11px" bg="currentColor" borderRadius="1px" />
                  <Box w="3px" h="11px" bg="currentColor" borderRadius="1px" />
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
          </Flex>
        </>
      ) : null}
    </Box>
  );
};

export default HeroCarousel;
