import React, { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Box, useColorMode } from '@chakra-ui/react';

import ImageAnimator from '@/components/ImageAnimator/ImageAnimator';

/**
 * A CHAPTER'S PICTURE, WITH MOTION IN IT.
 *
 * ResponsiveMedia beside this draws the same four files as a still. This
 * draws the chosen one as a SCENE - the engine the storefront's adverts use -
 * so the picture drifts rather than sitting there, and keeps drifting for as
 * long as the chapter is on screen.
 *
 * ONE PLATE, OR A WHOLE SCENE. `layers` is a slot's pictures, each carrying
 * its own `layer` geometry (see images.js): the first is the ground and the
 * rest arrive over it, which is what the engine is actually for. Without it -
 * a chapter whose slot holds a single file - this draws that file as one
 * drifting plate, which is what every other chapter wants.
 *
 * THE CROPS ARE CHOSEN THE SAME WAY in the one-plate case: a desktop crop, a
 * mobile crop, and a dark rendering of each, with desktop as the fallback for
 * mobile and the light file as the fallback for dark. What differs from
 * ResponsiveMedia is that ONE of them is drawn rather than both - a scene is
 * not a pair of <img> elements that CSS can hide, so the crop is chosen here,
 * in JavaScript, from the same `md` breakpoint.
 *
 * NOT VERIFIED, and that is correct rather than a shortcut. These pictures
 * are bundled into the build (pages/about/images.js), not uploaded, so there
 * is no signature to check and nothing a visitor could swap without replacing
 * the build. `verified={false}` says so out loud; an advert's layers, which
 * ARE uploads, are checked as they always were.
 *
 * IT LOOPS, AND IT CAN BE STOPPED. `loop` is the engine's default now, so the
 * motion repeats for as long as the chapter is in front of somebody. To stop
 * it from code, hold a ref to this and call `pause()` - or pass
 * `isPlaying={false}`, which is the declarative half of the same switch:
 *
 *     const picture = useRef(null);
 *     <AboutScene ref={picture} ... />
 *     picture.current.pause();     // and play(), restart(), reset()
 *
 * THE HANDLE DRIVES BOTH CROPS, because both are mounted and only one is
 * shown. Handing the same ref to the two animators would leave the second to
 * mount holding it, so pausing would stop the desktop scene while the phone
 * kept playing the one actually on screen - a bug that only appears on the
 * narrower of the two layouts, which is the harder one to notice.
 */

/** How long one pass of the drift takes. Slow enough not to be a distraction. */
const DRIFT_MS = 9000;

const AboutScene = React.forwardRef(function AboutScene(props, ref) {
  const {
    desktop, mobile, desktopDark, mobileDark, alt, ratio, isPlaying, loop, fit, layers
  } = props;

  const { colorMode } = useColorMode();
  const isDark = colorMode === 'dark';

  /* The same fallback order as ResponsiveMedia, kept deliberately identical. */
  const wide = (isDark && desktopDark) || desktop || null;
  const narrow = (isDark && mobileDark) || mobile || (isDark && desktopDark) || desktop || null;

  const shape = ratio || 16 / 10;

  /*
   * One scene per crop. The frame is 1200 wide in scene units and as tall as
   * the ratio asks, so the picture fills it exactly and the engine's scaling
   * does the rest - which is what makes it full width on a phone rather than
   * a fixed-size picture sitting in a wider box.
   */
  /*
   * CROPPED OR WHOLE, the same choice ResponsiveMedia offers and for the same
   * reason - see `fit` there. A photograph fills the frame; artwork that must
   * be seen entire passes `fit="contain"`.
   */
  const cropping = fit === 'contain' ? 'contain' : 'cover';

  /*
   * THE LAYERS A SLOT DECLARED, in the shape the engine reads.
   *
   * A picture with no `layer` fills the frame and covers it, which makes the
   * first file of any slot a usable background whether or not anybody wrote
   * geometry for it. `z` is the position in the list: the order the files are
   * written in IS the stacking order, so adding a layer in front means
   * appending one.
   */
  const declared = useMemo(() => (layers || [])
    .filter((picture) => picture && picture.src)
    .map((picture, index) => {
      const own = picture.layer || {};
      const first = index === 0;

      return {
        id: 'layer-' + (index + 1),
        type: 'image',
        src: picture.src,
        alt: picture.alt || '',
        fit: own.fit || (first ? 'cover' : 'contain'),
        /* Absent placement means "the whole frame", which is what a ground wants. */
        x: own.x === undefined ? 0 : own.x,
        y: own.y === undefined ? 0 : own.y,
        width: own.width,
        height: own.height,
        z: index + 1,
        parallax: own.parallax,
        sheen: own.sheen,
        animation: {
          name: own.animation || 'zoom-out',
          delay: own.delay || 0,
          duration: own.duration || DRIFT_MS,
          easing: own.easing || 'ease-out'
        }
      };
    }), [layers]);

  const sceneFor = useCallback((src, id) => (src ? {
    sceneId: 'about-' + id,
    width: 1200,
    height: Math.round(1200 / shape),
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
  } : null), [shape, alt, cropping]);

  /*
   * A DECLARED SCENE IS THE SAME ON BOTH, because its layers are placed in
   * the frame's own units rather than cropped for a width - the engine scales
   * the whole composition, so there is nothing to choose between. Only the
   * one-plate case has two crops to pick from.
   */
  const composed = useMemo(() => (declared.length > 1 ? {
    sceneId: 'about-composed',
    width: 1200,
    height: Math.round(1200 / shape),
    duration: DRIFT_MS,
    layers: declared
  } : null), [declared, shape]);

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
        /* A composed scene is the only one drawn, at every width. */
        composed ? 'block' : { base: 'none', md: 'block' },
        wideRef
      )}
    </Box>
  );
});

export default AboutScene;
