import React, {
  useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState
} from 'react';
import { Box } from '@chakra-ui/react';
import { Global } from '@emotion/react';

import { useVerifiedImages } from '@/components/security/hooks';
import { STATES } from '@/security/verifySignature';
import AnimationLayer from './AnimationLayer';
import { PARALLAX_LIMIT, keyframesStylesheet } from './animationRegistry';
import { isScene, normaliseScene, sourcesOf } from './scene';

/**
 * AN ANIMATED SCENE, in place of a flat picture.
 *
 *   <ImageAnimator scene={scene} isPlaying autoplay />
 *
 * A scene is a background and a handful of transparent layers, each with its
 * own motion and its own moment to start - a cloud drifting in over a
 * mountain, a phone rising into frame, the copy arriving after it. It is
 * stored as JSON on the row it belongs to (site_adverts.scene), so the same
 * component draws a homepage hero, a smartphone hero and a product's own
 * artwork without any of those pages knowing how an animation works.
 *
 * ONE SIZE, WRITTEN ONCE (spec section 7). The scene declares the frame it
 * was drawn in and every layer is placed in that frame; this scales the whole
 * frame to whatever width it is given. So a scene authored at 1920x760 is
 * correct at 768 and at 390 with no second set of numbers, and a layer that
 * was a quarter of the width stays a quarter of the width.
 *
 * The scaling is ONE transform on a wrapper rather than arithmetic on every
 * layer: it is composited, it cannot round differently per layer, and it
 * scales type and shadows along with the pictures.
 *
 * THE CLOCK IS NOT ITS OWN. `isPlaying` is a prop, because the thing that
 * knows whether a scene should be running is the carousel around it - which
 * already stops for a hover, a hidden tab and a visitor who pressed pause.
 * Two clocks would drift apart within one rotation. The imperative handle
 * (play, pause, restart, reset - spec section 7) is there for the console's
 * preview, which has no carousel to ask.
 *
 * EVERY LAYER IS VERIFIED IN ONE CALL. The scene asks about all of its
 * pictures at once, and hands each layer its own answer: one round of
 * checking for the scene rather than one per layer, and a layer whose bytes
 * do not match its signature is simply not drawn - the rest of the scene
 * still plays. A background that fails takes the scene with it, since what is
 * left would be cut-outs floating on nothing.
 */
const ImageAnimator = React.forwardRef(function ImageAnimator(props, ref) {
  const {
    scene, isPlaying, autoplay, onDuration, ratio, borderRadius, ariaLabel, fill
  } = props;

  const normalised = useMemo(() => (isScene(scene) ? normaliseScene(scene) : null), [scene]);

  /*
   * A run is one playing of the scene. Changing it remounts every layer,
   * which is how a CSS animation is replayed - re-assigning the same
   * animation to a live element does nothing at all.
   */
  const [runId, setRunId] = useState(0);
  const [running, setRunning] = useState(autoplay !== false);

  const frameRef = useRef(null);
  const [frameWidth, setFrameWidth] = useState(0);

  const reduced = useMemo(() => (
    typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ), []);

  /* The controls the spec asks for, for anything holding a ref to this. */
  useImperativeHandle(ref, () => ({
    play() { setRunning(true); },
    pause() { setRunning(false); },
    restart() { setRunId((current) => current + 1); setRunning(true); },
    reset() { setRunId((current) => current + 1); setRunning(false); }
  }), []);

  /*
   * THE FRAME'S WIDTH, MEASURED RATHER THAN ASSUMED.
   *
   * The scale factor is this width over the scene's own, so it has to be a
   * real number from the page: a breakpoint guess would be wrong inside every
   * container that is not the full width - a product page's column, the
   * console's preview panel.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const measure = () => setFrameWidth(frame.clientWidth || 0);
    measure();

    /* ResizeObserver where there is one; a resize listener is enough elsewhere. */
    if (typeof window !== 'undefined' && window.ResizeObserver) {
      const observer = new window.ResizeObserver(measure);
      observer.observe(frame);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /*
   * WHERE THE POINTER IS, for the layers that have depth (spec phase 5).
   *
   * Held as an offset in scene units from the middle of the frame, and only
   * while a layer actually asks for parallax - a scene with none listens to
   * nothing, which is almost every scene. It is cleared on the way out, so a
   * scene does not keep the last position the pointer had as it left.
   *
   * TOUCH IS NOT TRACKED. A finger is a tap, not a hover, and moving layers
   * under a scroll gesture is motion sickness rather than depth.
   */
  const [pointer, setPointer] = useState(null);
  const wantsParallax = !!normalised && normalised.layers.some((layer) => layer.parallax > 0);

  const onPointerMove = useCallback((event) => {
    if (!wantsParallax) return;

    const frame = frameRef.current;
    if (!frame) return;

    const box = frame.getBoundingClientRect();
    if (!box.width || !box.height) return;

    /* -1..1 from the middle, then scaled to the depth budget. */
    const x = (((event.clientX - box.left) / box.width) - 0.5) * 2;
    const y = (((event.clientY - box.top) / box.height) - 0.5) * 2;
    setPointer({ x: x * PARALLAX_LIMIT, y: y * PARALLAX_LIMIT });
  }, [wantsParallax]);

  /* A scene that changes is a new run, from its first frame. */
  const sceneId = normalised ? normalised.id : null;
  useEffect(() => {
    setRunId((current) => current + 1);
  }, [sceneId]);

  /* What the scene is worth on a carousel's clock - see HeroCarousel. */
  useEffect(() => {
    if (normalised && onDuration) onDuration(normalised.duration);
  }, [normalised, onDuration]);

  const sources = useMemo(() => sourcesOf(scene), [scene]);
  const verification = useVerifiedImages(
    sources.map((src) => ({ integrity: integrityFor(scene, src), expectedPath: src }))
  );

  const answerFor = useCallback((src) => {
    const at = sources.indexOf(src);
    return at === -1 ? null : verification[at];
  }, [sources, verification]);

  if (!normalised) return null;

  const playing = (isPlaying === undefined ? running : isPlaying) && !reduced;
  const scale = frameWidth ? frameWidth / normalised.width : 0;

  const background = normalised.background;
  const backgroundAnswer = background && background.src ? answerFor(background.src) : null;
  const backgroundRefused = !!background
    && !!background.src
    && !!backgroundAnswer
    && backgroundAnswer.state !== STATES.CHECKING
    && backgroundAnswer.state !== STATES.VERIFIED;

  if (backgroundRefused) return null;

  return (
    <>
      {/* The whole library, once per page however many scenes are on it. */}
      <Global styles={keyframesStylesheet()} />

      <Box
        ref={frameRef}
        overflow="hidden"
        borderRadius={borderRadius === undefined ? '16px' : borderRadius}
        /*
          * A frame of its own, or somebody else's.
          *
          * On its own, it keeps the scene's proportions - height over width -
          * which is what a page dropping a scene into a column wants. `fill`
          * is for a carousel slide, which has already reserved the space and
          * whose box a second ratio inside it would fight.
          */
        {...(fill
          ? { position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' }
          : { position: 'relative', pb: ratio || (((normalised.height / normalised.width) * 100) + '%') })}
        onMouseMove={wantsParallax ? onPointerMove : undefined}
        onMouseLeave={wantsParallax ? () => setPointer(null) : undefined}
        role="img"
        aria-label={ariaLabel || undefined}
        data-scene={normalised.id}
        data-scene-playing={playing ? 'yes' : 'no'}
      >
        {/*
          * THE SCENE, AT ITS OWN SIZE, SCALED ONCE.
          *
          * Laid out in scene units and then scaled from the top left, so
          * every layer's placement is the number the author wrote. Until the
          * frame has been measured the scale is 0, which draws nothing -
          * a frame of nothing is better than a frame of a scene at 1:1
          * overflowing its box.
          */}
        <Box
          position="absolute"
          top="0"
          left="0"
          style={{
            width: normalised.width + 'px',
            height: normalised.height + 'px',
            transform: 'scale(' + scale + ')',
            transformOrigin: 'top left',
            willChange: 'transform'
          }}
        >
          {background && background.src && (
            <AnimationLayer
              layer={{
                id: 'background',
                type: 'image',
                src: background.src,
                alt: background.alt || '',
                x: 0,
                y: 0,
                width: null,
                height: null,
                z: 0,
                animation: normaliseBackgroundAnimation(background)
              }}
              scene={normalised}
              verification={backgroundAnswer}
              isPlaying={playing}
              reduced={reduced}
              runId={runId}
              pointer={pointer}
            />
          )}

          {normalised.layers.map((layer) => {
            const answer = layer.type === 'image' && layer.src ? answerFor(layer.src) : null;

            /* A picture that failed its signature is left out; the rest plays. */
            if (answer && answer.state !== STATES.CHECKING && answer.state !== STATES.VERIFIED) {
              return null;
            }

            return (
              <AnimationLayer
                key={layer.id + '-' + runId}
                layer={layer}
                scene={normalised}
                verification={answer}
                isPlaying={playing}
                reduced={reduced}
                runId={runId}
                pointer={pointer}
              />
            );
          })}
        </Box>
      </Box>
    </>
  );
});

/** The background's own motion, defaulting to the slow settle it usually wants. */
function normaliseBackgroundAnimation(background) {
  const animation = (background && background.animation) || {};
  return {
    name: animation.name || 'zoom-out',
    delay: Math.max(0, Number(animation.delay) || 0),
    duration: Math.max(0, Number(animation.duration) || 5000),
    easing: animation.easing || 'ease-out',
    repeat: 1,
    direction: 'normal',
    continuous: false
  };
}

/**
 * The signed envelope a scene carries for one of its pictures.
 *
 * The API attaches these per layer on the way out, beside the `src` they
 * belong to. A scene from a preset file has none, and says so by being null -
 * which the verifier reads as unsigned, and unsigned is refused.
 */
function integrityFor(scene, src) {
  if (!scene) return null;

  if (scene.background && scene.background.src === src && scene.background.integrity) {
    return scene.background.integrity;
  }

  const layers = Array.isArray(scene.layers) ? scene.layers : [];
  for (let i = 0; i < layers.length; i += 1) {
    if (layers[i] && layers[i].src === src) return layers[i].integrity || null;
  }

  return null;
}

export default ImageAnimator;
