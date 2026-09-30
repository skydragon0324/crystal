import React from 'react';
import { Box, Text } from '@chakra-ui/react';

import Picture from '@/components/common/Picture';
import { fileUrl } from '@/api/client';
import { definitionOf, keyframeNameOf } from './animationRegistry';

/**
 * ONE LAYER OF A SCENE: a transparent picture, or a line of text, placed in
 * the scene's own frame and given its motion.
 *
 * IT IS PLACED WITH `top`/`left`/`width`/`height` AND MOVED WITH `transform`,
 * and the difference matters. The placement is written once, when the layer
 * mounts, and never touched again; the motion is a transform, which the
 * browser composites without laying the page out. Animating the placement
 * instead - the obvious way - is a layout on every frame of every layer
 * (spec section 10).
 *
 * THE PICTURE IS VERIFIED LIKE ANY OTHER. A scene's layers are uploads, and
 * an uploaded file that is drawn without checking its signature is a hole in
 * the storefront's one real guarantee - so each layer is handed the answer
 * the scene's single verification call already worked out, and draws the
 * object URL from it or nothing at all.
 *
 * REDUCED MOTION IS NOT A BLANK FRAME. Somebody who asks their system for
 * less movement wants the RESULT without the journey, so every layer is drawn
 * in its finished state - see `still` in the registry - rather than being
 * left in its from-state with the animation switched off.
 */
export default function AnimationLayer({ layer, scene, verification, isPlaying, reduced, runId, pointer }) {
  const definition = definitionOf(layer.animation.name);

  /* Absent size means "fill the frame", which is what a background wants. */
  const width = layer.width === null ? scene.width : layer.width;
  const height = layer.height === null ? scene.height : layer.height;

  /*
   * INLINE STYLE, NOT STYLE PROPS, and for the same reason the keyframes are
   * one stylesheet: every one of these values comes from the scene's data, so
   * as Chakra props they would mint an Emotion class per layer per scene -
   * a stylesheet that grows with the content, for values no theme has an
   * opinion about. A layer's position is data; the colours around it are
   * design, and those stay props.
   */
  const placement = {
    position: 'absolute',
    left: layer.x + 'px',
    top: layer.y + 'px',
    width: width + 'px',
    height: height + 'px',
    zIndex: layer.z,
    /* Nothing in a scene is a click target; the slide around it is. */
    pointerEvents: 'none'
  };

  /*
   * `both` is the fill mode that makes a delay behave: the layer holds its
   * from-state while it waits, instead of sitting in its final position and
   * then jumping back to start. `runId` is in the key upstream, so a restart
   * remounts this and the animation plays again from the beginning - the only
   * reliable way to replay a CSS animation.
   */
  const motion = reduced || layer.animation.name === 'none'
    ? definition.still
    : {
      animationName: keyframeNameOf(layer.animation.name),
      animationDuration: layer.animation.duration + 'ms',
      animationDelay: layer.animation.delay + 'ms',
      animationTimingFunction: layer.animation.easing,
      animationFillMode: 'both',
      animationIterationCount: layer.animation.repeat,
      animationDirection: layer.animation.direction,
      animationPlayState: isPlaying ? 'running' : 'paused'
    };

  /*
   * PARALLAX IS A SECOND TRANSFORM, ON A WRAPPER.
   *
   * It cannot go on the layer itself: that element's transform belongs to its
   * animation, and CSS has one transform property - writing the pointer
   * offset into it would fight the keyframes for it every frame. So depth
   * moves the wrapper and the animation moves what is inside, and the two
   * compose instead of overwriting each other.
   */
  const depth = layer.parallax && pointer && !reduced
    ? {
      transform: 'translate3d('
        + (pointer.x * layer.parallax * -1) + 'px, '
        + (pointer.y * layer.parallax * -1) + 'px, 0)',
      transition: 'transform 220ms ease-out',
      willChange: 'transform'
    }
    : null;

  const inner = (
    <Box
      key={layer.id + '-' + runId}
      data-scene-layer={layer.id}
      data-animation={layer.animation.name}
      style={Object.assign({}, depth ? Object.assign({}, placement, {
        position: 'static',
        left: undefined,
        top: undefined,
        width: '100%',
        height: '100%'
      }) : placement, motion)}
    >
      {layer.type === 'text' ? (
        <Text
          fontSize={layer.fontSize + 'px'}
          fontWeight={layer.weight}
          color={layer.colour}
          textAlign={layer.align}
          lineHeight="1.1"
          /* Drawn over artwork, which may be any colour underneath it. */
          textShadow="0 2px 18px rgba(0, 0, 0, 0.45)"
          whiteSpace="pre-wrap"
        >
          {layer.text}
        </Text>
      ) : (
        <Picture
          verification={verification}
          src={fileUrl(layer.src)}
          alt={layer.alt || ''}
          height="100%"
          rounded={false}
          /*
           * A CUT-OUT HAS NOTHING BEHIND IT.
           *
           * Picture draws every other picture on the site in a frame - a
           * raised background, and a skeleton while the bytes arrive - which
           * is right for a photograph filling a card and wrong for a cloud:
           * a transparent layer over that frame is a cloud in a grey box,
           * and the box is exactly the rectangle the artwork was drawn to
           * avoid. So no ground, and no skeleton: a layer that has not
           * arrived yet is simply not there, which is what the scene behind
           * it expects.
           */
          bg="transparent"
          skeleton={false}
          /*
           * `contain`, because a layer is a cut-out at a size the scene chose:
           * cropping it would trim the edges off a cloud or a phone body,
           * which is exactly what a transparent layer is drawn to avoid.
           */
          fit="contain"
          eager
        />
      )}

      {/*
        * THE LIGHT SWEEP: a soft band travelling across the layer, on a loop.
        *
        * A gradient rather than a picture, and a transform rather than a
        * moving background-position, so it costs one composited element and
        * no extra file. `mixBlendMode: screen` is what makes it read as light
        * ON the artwork rather than a white shape over it.
        */}
      {layer.sheen && !reduced && (
        <Box
          aria-hidden="true"
          position="absolute"
          top="0"
          bottom="0"
          left="0"
          width="40%"
          pointerEvents="none"
          style={{
            background: 'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0) 100%)',
            mixBlendMode: 'screen',
            animationName: 'crystalSceneSheen',
            animationDuration: '2600ms',
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-in-out',
            animationPlayState: isPlaying ? 'running' : 'paused'
          }}
        />
      )}
    </Box>
  );

  if (!depth) return inner;

  /* The wrapper holds the position; the layer inside it holds the motion. */
  return (
    <Box
      key={layer.id + '-depth-' + runId}
      style={Object.assign({}, placement, depth)}
    >
      {inner}
    </Box>
  );
}
