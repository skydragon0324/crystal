import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, IconButton, Link, Tooltip } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { fileUrl } from '@/api/client';
import AdvertVideo from '@/components/common/AdvertVideo';
import Picture from '@/components/common/Picture';
import { useVerifiedImages } from '@/components/security/hooks';
import { ImagePlaceholder } from '@/components/security/IntegrityState';
import { STATES } from '@/security/verifySignature';
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
 *   - arrows on hover or keyboard focus, keyboard arrows when focused, swipe
 *     on touch
 *   - pauses on hover and while the tab is in the background, and does not
 *     autoplay at all for somebody who asked for reduced motion
 *   - every slide is a Picture (components/common/Picture.js): a skeleton
 *     stands in the slide until its file has decoded, so a slow picture is
 *     visibly on its way rather than a flat panel
 *
 * UNTIMED DECKS
 * -------------
 * `autoPlay={false}` is a deck with NO CLOCK AT ALL, not a clock that starts
 * paused: no play button to start it, and plain position marks for indicators
 * instead of progress bars that would sit empty forever.
 *
 * Nothing asks for it today - the product page's shots were the one untimed
 * deck and they play now (components/product/ProductShots.js) - but a deck
 * that must not move on its own is a real thing to want, and this is the
 * difference between it and a paused clock.
 *
 * ONE SLIDE IS A PICTURE, NOT A CAROUSEL OF ONE: no arrows, no indicators,
 * no "carousel" role for a screen reader to announce and no keyboard stop
 * that does nothing when it is reached.
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
 *
 * VERIFIED DECKS
 * --------------
 * With `verified`, every slide must carry its image's signed `integrity`
 * envelope, and a slide is drawn only from bytes that matched it - an object
 * URL made after the size, SHA-256 and type all agreed with a trusted
 * signature. A slide with no envelope is unsigned, and unsigned is invalid.
 * Without `verified` the carousel is what it always was, for pictures outside
 * the signed surfaces (the About page's slots).
 *
 * The whole deck is verified by ONE hook call, so the carousel knows the
 * answer for every slide at once and each picture is downloaded exactly once:
 * the slide's Picture is handed its own result through `verification` rather
 * than checking itself again - and Picture draws the object URL in that
 * result or nothing, never the file's address - while the verifier's cache
 * shares the bytes with any other layout of the same pictures on the page.
 *
 * A SLIDE THAT FAILS IS LEFT OUT OF THE DECK, rather than shown as a
 * placeholder slide. Reasons, in order of weight:
 *
 *   - a deck is a rotation of pictures somebody chose to show; a panel that
 *     says "could not be verified" every seven seconds is a notice nobody
 *     chose, in the most prominent place on the page, about something the
 *     visitor can do nothing about
 *   - a placeholder slide still carries the row's link (which is not signed),
 *     and a visitor could follow an advert they were never shown
 *   - the neutral message is not lost: if NO slide verifies, the carousel's
 *     frame shows it in place of the deck, and every failure is in the console
 *
 * A FILM IS THE ONE SLIDE THAT IS NOT VERIFIED, and it is not dropped either.
 * The server does not sign video: a signature is checked by hashing the whole
 * file, and an advert film may be sixty megabytes, so checking one in the
 * browser would mean downloading all of it before the first frame appeared.
 * It is checked at the door instead - the stored bytes must really be MP4 or
 * WebM - and played from its ordinary address. An animated GIF is an image
 * and is verified like every other image. See components/common/AdvertVideo.
 *
 * To keep that from rearranging a deck under the visitor, a slide joins only
 * once every slide BEFORE it has been answered. The first picture shown is
 * therefore always the first one that verified, later slides are appended as
 * they arrive (normally long before the first advance), and a deck never
 * shrinks while it is on screen.
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

/*
 * THE BOX AN ADVERT RUN IS DRAWN IN, following the crop the API sends: a
 * phone - under 768px, the width api/client.js reports as mobile - gets the
 * 1080x1350 artwork, and a desktop the 1920x760 banner. One fixed ratio cut
 * the phone crops to a strip through their middle.
 */
export const ADVERT_RATIO = { base: '125%', md: '39.6%' };

/**
 * Whether a slide is a film rather than a picture.
 *
 * The API says so - `media_type`, decided on the server from the stored
 * file's real type - and the page hands it over as `mediaType`. Nothing here
 * parses the path: the rule for what counts as video lives in one place, on
 * the server (utils/mediaKind.js), and this is what it answered.
 */
function isVideoSlide(slide) {
  return !!slide && slide.mediaType === 'video';
}

/**
 * The slides that may be drawn, in order - see VERIFIED DECKS above.
 *
 * `waiting` is true while some slide not yet in the deck is still being
 * checked; `failed` says what the frame should show if nothing made it in.
 */
function verifiedDeck(source, results) {
  const deck = [];
  let waiting = false;

  for (let i = 0; i < source.length; i += 1) {
    /*
     * A FILM IS NOT CHECKED AND IS NOT DROPPED. It carries no envelope - the
     * server does not sign video, because a signature is checked by hashing
     * the whole file - so there is no answer to wait for and nothing to
     * refuse. It goes into the deck as it is, and AdvertVideo explains what
     * is and is not promised about it.
     */
    if (isVideoSlide(source[i])) {
      deck.push(source[i]);
      continue;
    }

    const result = results[i];
    if (!result || result.state === STATES.CHECKING) {
      waiting = true;
      break;
    }
    if (result.state === STATES.VERIFIED) {
      deck.push(Object.assign({}, source[i], { verification: result }));
    }
  }

  const allErrors = results.length > 0 && results.every((result) => result.state === STATES.ERROR);
  return { deck: deck, waiting: waiting, failed: allErrors ? STATES.ERROR : STATES.INVALID };
}

export default function HeroCarousel({
  slides, interval, ratio, borderRadius, showArrows, autoPlay, ariaLabel, objectFit, verified
}) {
  const t = useT();

  const surface = useSurface();
  const source = useMemo(() => slides || [], [slides]);

  /*
   * Called on every render, verified deck or not - hooks cannot be skipped.
   * An unverified carousel asks about no pictures, which costs nothing.
   */
  const verification = useVerifiedImages(
    verified
      ? source.map((slide) => (isVideoSlide(slide)
        /* Nothing to check: a film has no envelope, so nothing is asked about it. */
        ? { integrity: null, expectedPath: null }
        : { integrity: slide.integrity, expectedPath: slide.path }))
      : null
  );

  const checked = verified ? verifiedDeck(source, verification) : null;
  const deck = checked ? checked.deck : source;
  const count = deck.length;

  /* See UNTIMED DECKS at the top: false means no clock, not a paused one. */
  const timed = autoPlay !== false;

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(timed);
  const [hovering, setHovering] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);

  /*
   * A FILM SETS ITS OWN SLIDE'S LENGTH.
   *
   * A picture is shown for `interval`, which is a number this page chose. A
   * film has a length of its own, and cutting a twenty second advert off at
   * seven because that is what the pictures get is the kind of thing nobody
   * reports as a bug - they just never see the end of it. So each video hands
   * its duration over as it loads, and the slide it is on runs for that long.
   *
   * Clamped at both ends: a two second clip would flick past before it
   * registered, and a long one would look like a carousel that had stopped.
   */
  const [durations, setDurations] = useState({});

  const rememberDuration = useCallback((position, seconds) => {
    if (!seconds || !isFinite(seconds)) return;
    const held = Math.min(45000, Math.max(4000, Math.round(seconds * 1000)));
    setDurations((current) => (current[position] === held
      ? current
      : Object.assign({}, current, { [position]: held })));
  }, []);

  const every = durations[index] || interval || 6000;

  const reduced = useMemo(prefersReducedMotion, []);
  const touchStart = useRef(null);
  const dotsRef = useRef(null);

  /*
   * A single slide is a PICTURE, not a carousel: no timer, no indicators, no
   * arrows. Every hook above and below still runs - the guards are on
   * `count` rather than on an early return, because hooks cannot be skipped.
   */
  const isDeck = count > 1;

  /** Whether a timed fill exists at all. */
  const animatable = isDeck && timed && !reduced;

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

  /*
   * THE DOT STRIP FOLLOWS THE SLIDESHOW.
   *
   * Where there are more dots than fit - a long run of adverts on a phone -
   * the strip scrolls, and the live slide's dot would otherwise be off the
   * end of it: the fill that says how long is left would be running out of
   * sight. Centring it on each change keeps the deck's position legible and
   * leaves the neighbouring dots tappable.
   */
  useEffect(() => {
    const strip = dotsRef.current;
    if (!strip || typeof strip.scrollTo !== 'function') return;

    const dot = strip.children[index];
    if (!dot) return;

    const left = dot.offsetLeft - ((strip.clientWidth - dot.offsetWidth) / 2);
    try {
      strip.scrollTo({ left: left, behavior: reduced ? 'auto' : 'smooth' });
    } catch (error) {
      /* Older engines take the two-argument form, and jsdom takes neither. */
      strip.scrollLeft = left;
    }
  }, [index, reduced]);

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

  const onTouchStart = (event) => {
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  /*
   * A SWIPE IS SIDEWAYS. A thumb scrolling the page down over the carousel
   * drifts a little left or right on the way, and a deck that turns every
   * time somebody scrolls past it is a deck nobody can scroll past - so a
   * movement that went further up or down than across is left to the page.
   */
  const onTouchEnd = (event) => {
    if (touchStart.current === null) return;
    const dx = event.changedTouches[0].clientX - touchStart.current.x;
    const dy = event.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) goNext(); else goPrev();
  };

  if (!count) {
    if (!checked || !source.length) return null;

    /*
     * A verified deck with nothing to show YET, or nothing that verified at
     * all: the frame keeps its size, with a skeleton while the first slide
     * is checked and the neutral placeholder if none passed.
     */
    return (
      <Box
        position="relative"
        overflow="hidden"
        borderRadius={borderRadius === undefined ? '16px' : borderRadius}
        bg={surface.raised}
        role={source.length > 1 ? 'region' : undefined}
        aria-label={source.length > 1 ? (ariaLabel || t('common.featured')) : undefined}
      >
        <Box position="relative" pb={ratio || '42%'}>
          <ImagePlaceholder state={checked.waiting ? STATES.CHECKING : checked.failed} />
        </Box>
      </Box>
    );
  }

  const arrowStyle = {
    position: 'absolute',
    top: '50%',
    borderRadius: 'full',
    color: 'white',
    bg: 'blackAlpha.400',
    _hover: { bg: 'blackAlpha.600' },
    _active: { bg: 'blackAlpha.600' },
    // Revealed by hover - or by keyboard focus anywhere in the carousel - on
    // a pointer device, but ALWAYS present on touch, where there is no hover
    // to reveal them and a swipe is not discoverable on its own.
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
        /* A dot keeps its size; the strip scrolls instead of the dots thinning. */
        flexShrink={0}
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
      /* A carousel to assistive technology only when there is a deck - see ONE SLIDE at the top. */
      role={isDeck ? 'region' : undefined}
      aria-roledescription={isDeck ? 'carousel' : undefined}
      aria-label={isDeck ? (ariaLabel || t('common.featured')) : undefined}
      tabIndex={isDeck ? 0 : undefined}
      outline="none"
      /*
        A FOCUS RING for the keyboard only. Chrome 72 has no :focus-visible
        and drops this rule, which leaves it the arrows - revealed by
        :focus-within just below - as the sign that the deck has focus.
      */
      _focusVisible={{ boxShadow: 'outline' }}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      sx={{
        '&:hover .crystal-hero-arrow, &:focus-within .crystal-hero-arrow': { opacity: 1 }
      }}
    >
      <Box position="relative" pb={ratio || '42%'}>
        <Flex
          position="absolute"
          insetX="0" insetY="0"
          w={count * 100 + '%'}
          transform={'translateX(-' + (index * 100) / count + '%)'}
          transition={reduced ? undefined : 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)'}
          willChange="transform"
          /*
            A deck the visitor turns by hand announces the slide it turned
            to; one that turns itself stays quiet, or a screen reader would
            be interrupted every few seconds by an advert.
          */
          aria-live={isDeck && !running ? 'polite' : undefined}
        >
          {deck.map((slide, position) => (
            <Box
              key={slide.id || position}
              w={100 / count + '%'}
              h="100%"
              position="relative"
              role={isDeck ? 'group' : undefined}
              aria-roledescription={isDeck ? 'slide' : undefined}
              aria-label={isDeck ? (position + 1) + ' / ' + count : undefined}
              // A slide that is off screen is still in the DOM for the track
              // to move, but it is not content the page is offering now.
              aria-hidden={position !== index}
            >
              {isVideoSlide(slide) ? (
                /*
                 * A FILM, which plays only while it is the slide being shown
                 * and drives the clock itself: `onDuration` hands its length
                 * to the deck, so an advert runs to its end rather than being
                 * cut off at whatever the interval happens to be.
                 */
                <AdvertVideo
                  path={slide.path}
                  altText={slide.altText || slide.alt || ''}
                  active={position === index}
                  fit={objectFit || 'cover'}
                  onDuration={(seconds) => rememberDuration(position, seconds)}
                />
              ) : slide.verification ? (
                /*
                 * The deck's own answer for this slide, so nothing is checked
                 * or downloaded a second time. Only a VERIFIED slide is ever
                 * in a verified deck; Picture still refuses anything else,
                 * rather than trusting that - it draws the answer's object
                 * URL or the neutral placeholder, and never an address.
                 *
                 * EAGER, as the verified slides always were: in the browser
                 * mode the bytes were downloaded to be checked before there
                 * was anything to draw, so there is nothing left to defer.
                 */
                <Picture
                  verification={slide.verification}
                  alt={slide.altText || slide.alt || ''}
                  height="100%"
                  rounded={false}
                  fit={objectFit || 'cover'}
                  eager
                />
              ) : (
                <Picture
                  src={slide.url || fileUrl(slide.path)}
                  alt={slide.altText || slide.alt || ''}
                  height="100%"
                  rounded={false}
                  /*
                   * "cover" for a banner, which is what this mostly shows.
                   * A product page passes "contain": those are catalogue
                   * shots of a whole object, and cropping a phone to fill
                   * the frame is how the corners of it disappear.
                   */
                  fit={objectFit || 'cover'}
                  // The first slide is above the fold on every page that uses
                  // this; lazy-loading it delays the largest paint.
                  eager={position === 0}
                />
              )}
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
          /*
           * THE ROW CANNOT GROW PAST THE PICTURE.
           *
           * It is centred by `left: 50%` and a translate, so its width is
           * shrink-to-fit and nothing stopped it: eight adverts on a 390px
           * phone wanted more row than there was carousel, and since the
           * carousel clips its own overflow, the ends went under the edges -
           * taking the play/pause button, the last item in the row, off the
           * screen with them. There was no way to stop the slideshow on a
           * phone once a campaign had enough artwork in it.
           */
          maxW="calc(100% - 24px)"
          sx={{ backdropFilter: 'blur(6px)' }}
        >
          {/*
            * ONLY THE DOTS SCROLL. They are the part there can be any number
            * of, so they get the overflow and the shrinking; the divider and
            * the button after them are pinned. The bar is scrolled to keep
            * the live slide's dot in view, so the strip follows the slideshow
            * rather than needing to be dragged.
            *
            * The scrollbar itself is hidden in all three dialects - this is a
            * 14px strip inside a rounded pill, and a scrollbar drawn across
            * it is thicker than the dots.
            */}
          <Flex
            ref={dotsRef}
            align="center"
            minW="0"
            overflowX="auto"
            sx={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              '&::-webkit-scrollbar': { display: 'none' }
            }}
          >
            {deck.map(renderIndicator)}
          </Flex>

          {/*
            The play / pause control sits at the END OF THE INDICATOR ROW, as
            on mi.com - it reads as the last item of the same instrument
            rather than as a separate button parked nearby. An untimed deck
            has no clock to start or stop, so it has neither the control nor
            the divider in front of it.
          */}
          {timed && <Box w="1px" h="14px" bg="whiteAlpha.400" mx="6px" flexShrink={0} />}

          {/*
            A TOOLTIP RATHER THAN `title`: the native one is drawn by the
            operating system in its own font, which is the one thing on this
            carousel that cannot be styled.
          */}
          {timed && (
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
            /* Never squeezed by the dots, however many there are. */
            flexShrink={0}
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
          )}
        </Flex>
      )}
    </Box>
  );
}
