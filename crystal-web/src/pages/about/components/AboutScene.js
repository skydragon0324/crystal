import React, { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Box, useBreakpointValue, useColorMode } from '@chakra-ui/react';

import ImageAnimator from '@/components/ImageAnimator/ImageAnimator';

/**
 * A CHAPTER'S PICTURE, WITH MOTION IN IT.
 *
 * ResponsiveMedia beside this draws the same four files as a still. This
 * draws the chosen one as a SCENE - the engine the storefront's adverts use -
 * so the picture moves rather than sitting there, and keeps moving for as
 * long as the chapter is on screen.
 *
 * ONE PLATE, OR A COMPOSITION.
 *
 *   ONE PLATE is the ordinary case and what every other chapter wants: a
 *   photograph, drifting. It picks between the four files the way
 *   ResponsiveMedia does - a desktop crop, a mobile crop, and a dark
 *   rendering of each, with desktop as the fallback for mobile and the light
 *   file as the fallback for dark. What differs is that ONE of them is drawn
 *   rather than both: a scene is not a pair of <img> elements CSS can hide,
 *   so the crop is chosen here, in JavaScript, at the same `md` breakpoint.
 *
 *   A COMPOSITION is `compose` plus `layers` - a slot's pictures, and a
 *   function that places them. The function is handed the frame it is being
 *   drawn in and returns the engine's layers, which is what lets ONE
 *   composition be correct at two different frame shapes. See overviewScene.js
 *   for the only one so far, and why it has to work that way.
 *
 * `ratio` MAY BE A BREAKPOINT OBJECT, and for a composition it usually is:
 * the Overview chapter is 16:9 on a phone and 16:5 on a desktop. It has to be
 * resolved to a NUMBER here, because the frame's height is a division and
 * Chakra's responsive props cannot express one.
 *
 * NOT VERIFIED, and that is correct rather than a shortcut. These pictures
 * are bundled into the build (pages/about/images.js), not uploaded, so there
 * is no signature to check and nothing a visitor could swap without replacing
 * the build. `verified={false}` says so out loud; an advert's layers, which
 * ARE uploads, are checked as they always were.
 *
 * IT LOOPS, AND IT CAN BE STOPPED. `loop` is the engine's default, so the
 * motion repeats for as long as the chapter is in front of somebody. To stop
 * it from code, hold a ref to this and call `pause()` - or pass
 * `isPlaying={false}`, which is the declarative half of the same switch:
 *
 *     const picture = useRef(null);
 *     <AboutScene ref={picture} ... />
 *     picture.current.pause();     // and play(), restart(), reset()
 *
 * THE HANDLE DRIVES BOTH CROPS, because in the one-plate case both are
 * mounted and only one is shown. Handing the same ref to the two animators
 * would leave the second to mount holding it, so pausing would stop the
 * desktop scene while the phone kept playing the one actually on screen - a
 * bug that only appears on the narrower of the two layouts, which is the
 * harder one to notice.
 */

/** The frame's width in scene units. Everything else is scaled from it. */
const FRAME_WIDTH = 1200;

/** How long one pass of a single plate's drift takes. */
const DRIFT_MS = 9000;

const AboutScene = React.forwardRef(function AboutScene(props, ref) {
  const {
    desktop, mobile, desktopDark, mobileDark, alt, ratio,
    isPlaying, loop, fit, layers, compose, duration
  } = props;

  const { colorMode } = useColorMode();
  const isDark = colorMode === 'dark';

  /* The same fallback order as ResponsiveMedia, kept deliberately identical. */
  const wide = (isDark && desktopDark) || desktop || null;
  const narrow = (isDark && mobileDark) || mobile || (isDark && desktopDark) || desktop || null;

  /*
   * A NUMBER, whatever was passed. `useBreakpointValue` is called
   * unconditionally - hooks cannot be - and its answer is used only when the
   * prop is actually a breakpoint object.
   */
  const responsive = useBreakpointValue(
    ratio && typeof ratio === 'object' ? ratio : { base: 0 }
  );
  const shape = (typeof ratio === 'number' ? ratio : responsive) || 16 / 10;

  const height = Math.round(FRAME_WIDTH / shape);

  /*
   * CROPPED OR WHOLE, the same choice ResponsiveMedia offers and for the same
   * reason - see `fit` there. A photograph fills the frame; artwork that must
   * be seen entire passes `fit="contain"`.
   */
  const cropping = fit === 'contain' ? 'contain' : 'cover';

  /*
   * THE SLOT'S PICTURES, BY ROLE. A composition asks for "the globe" rather
   * than "the fifth file", so that inserting a cloud at the top of the list
   * does not move everything else into the wrong place - see images.js.
   */
  const byRole = useMemo(() => {
    const found = {};
    (layers || []).forEach(function (picture) {
      if (picture && picture.src && picture.role) found[picture.role] = picture;
    });
    return found;
  }, [layers]);

  /*
   * A COMPOSITION IS ONE SCENE AT EVERY WIDTH, because its layers are placed
   * in the frame's own units: the engine scales the whole thing, and the
   * frame's SHAPE has already been chosen above. Only the one-plate case has
   * two crops to pick between.
   */
  const composed = useMemo(() => {
    if (typeof compose !== 'function') return null;

    const built = compose(FRAME_WIDTH, height, byRole);
    if (!built || !built.length) return null;

    return {
      sceneId: 'about-composed-' + height,
      width: FRAME_WIDTH,
      height: height,
      duration: duration || DRIFT_MS,
      layers: built
    };
  }, [compose, height, byRole, duration]);

  const sceneFor = useCallback((src, id) => (src ? {
    sceneId: 'about-' + id,
    width: FRAME_WIDTH,
    height: height,
    duration: DRIFT_MS,
    layers: [{
      id: 'picture',
      type: 'image',
      src: src,
      alt: alt || '',
      fit: cropping,
      x: 0,
      y: 0,
      z: 1,
      /*
       * The whole frame, drifting. `zoom-out` settles from 1.15 to 1, which
       * over nine seconds reads as the camera easing back rather than as an
       * animation - and because it fills the frame at both ends, no edge of
       * the picture is ever uncovered.
       */
      animation: { name: 'zoom-out', duration: DRIFT_MS, easing: 'ease-out' }
    }]
  } : null), [height, alt, cropping]);

  const wideScene = useMemo(
    () => composed || sceneFor(wide, 'wide'),
    [composed, wide, sceneFor]
  );
  const narrowScene = useMemo(
    () => (composed ? null : sceneFor(narrow, 'narrow')),
    [composed, narrow, sceneFor]
  );

  /* One ref each, and one handle over the pair. */
  const wideRef = useRef(null);
  const narrowRef = useRef(null);

  useImperativeHandle(ref, () => {
    const both = (method) => function () {
      [narrowRef.current, wideRef.current].forEach(function (animator) {
        if (animator && animator[method]) animator[method]();
      });
    };

    return {
      play: both('play'),
      pause: both('pause'),
      restart: both('restart'),
      reset: both('reset')
    };
  }, []);

  if (!wideScene && !narrowScene) return null;

  const animator = (scene, display, hold) => (
    <Box display={display} w="100%">
      <ImageAnimator
        ref={hold}
        scene={scene}
        verified={false}
        isPlaying={isPlaying}
        loop={loop}
        ariaLabel={alt || ''}
        borderRadius="18px"
      />
    </Box>
  );

  return (
    <Box w="100%">
      {narrowScene && animator(narrowScene, { base: 'block', md: 'none' }, narrowRef)}
      {wideScene && animator(
        wideScene,
        /* A composition is the only scene drawn, at every width. */
        composed ? 'block' : { base: 'none', md: 'block' },
        wideRef
      )}
    </Box>
  );
});

export default AboutScene;
