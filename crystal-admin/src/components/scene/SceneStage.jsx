import React, { useEffect, useRef, useState } from 'react';
import { Box, Flex, IconButton, Text, Tooltip } from '@chakra-ui/react';
import { Global } from '@emotion/react';
import { MdPause, MdPlayArrow, MdReplay } from 'react-icons/md';

import { fileUrl } from '../../api/client';
import { useSurface } from '../../theme/tokens';
import { useT } from '../../i18n';
import { ANIMATIONS, keyframeNameOf, keyframesStylesheet } from './sceneAnimations';

/**
 * THE PREVIEW: a scene, playing, beside the fields that describe it.
 *
 * Without this an operator is writing coordinates and delays into a form and
 * finding out what they did by saving, opening the storefront and waiting for
 * the carousel to come round. With it, the answer is on the same screen as
 * the question.
 *
 * IT IS THE STOREFRONT'S RENDERER, MINUS THE VERIFICATION. Same layout - the
 * scene is laid out in its own frame and scaled once - same animations, same
 * fill mode, so what is previewed is what will be drawn. What is missing is
 * the signature check, deliberately: the console is the thing that uploaded
 * these files, and a preview that refused to show a picture until its
 * signature had been written would be blank for exactly as long as it takes
 * to be useful.
 *
 * THE CONTROLS ARE THE SPEC'S (section 7): play, pause and restart. Restart
 * is the one that matters while editing, because a delay of two seconds is
 * invisible until you have watched the first two seconds again.
 */
export default function SceneStage({ scene, height }) {
  const t = useT();
  const surface = useSurface();

  const frameRef = useRef(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const measure = () => setFrameWidth(frame.clientWidth || 0);
    measure();

    if (window.ResizeObserver) {
      const observer = new window.ResizeObserver(measure);
      observer.observe(frame);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const width = Number(scene && scene.width) || 1920;
  const sceneHeight = Number(scene && scene.height) || 760;
  const scale = frameWidth ? frameWidth / width : 0;

  const layers = Array.isArray(scene && scene.layers) ? scene.layers : [];

  /** One layer, placed and animated exactly as the storefront places it. */
  const draw = (layer, key, z) => {
    const animation = (layer && layer.animation) || {};
    const definition = ANIMATIONS[animation.name] || ANIMATIONS.none;

    const style = Object.assign({
      position: 'absolute',
      left: (Number(layer.x) || 0) + 'px',
      top: (Number(layer.y) || 0) + 'px',
      width: (layer.width === undefined || layer.width === null || layer.width === ''
        ? width
        : Number(layer.width) || 0) + 'px',
      height: (layer.height === undefined || layer.height === null || layer.height === ''
        ? sceneHeight
        : Number(layer.height) || 0) + 'px',
      zIndex: z,
      pointerEvents: 'none'
    }, {
      animationName: keyframeNameOf(animation.name),
      animationDuration: (Number(animation.duration) || 0) + 'ms',
      animationDelay: (Number(animation.delay) || 0) + 'ms',
      animationTimingFunction: animation.easing || 'ease-out',
      animationFillMode: 'both',
      animationIterationCount: definition.continuous ? 'infinite' : 1,
      animationDirection: definition.direction || 'normal',
      animationPlayState: playing ? 'running' : 'paused'
    });

    return (
      <Box key={key + '-' + runId} style={style} data-scene-layer={layer.id || key}>
        {layer.type === 'text' ? (
          <Text
            fontSize={(Number(layer.fontSize) || 64) + 'px'}
            fontWeight={Number(layer.weight) || 700}
            color={layer.colour || '#FFFFFF'}
            textAlign={layer.align || 'left'}
            lineHeight="1.1"
            textShadow="0 2px 18px rgba(0, 0, 0, 0.45)"
            whiteSpace="pre-wrap"
          >
            {layer.text || ''}
          </Text>
        ) : layer.src ? (
          <Box
            as="img"
            src={fileUrl(layer.src)}
            alt=""
            w="100%"
            h="100%"
            sx={{ objectFit: 'contain' }}
          />
        ) : (
          /*
            * A LAYER WITH NO PICTURE YET STILL SHOWS WHERE IT WILL BE.
            *
            * Filled rather than outlined: the whole scene is scaled down to
            * fit the preview, and a one pixel border scaled by 0.18 is not
            * a border any more - the first version of this drew four
            * invisible rectangles and read as an empty black frame.
            */
          <Box
            w="100%"
            h="100%"
            bg="whiteAlpha.200"
            border="4px dashed"
            borderColor="whiteAlpha.600"
            borderRadius="1rem"
          />
        )}
      </Box>
    );
  };

  return (
    <Box>
      <Global styles={keyframesStylesheet()} />

      <Box
        ref={frameRef}
        position="relative"
        overflow="hidden"
        borderRadius="0.75rem"
        bg="#0b0f18"
        border="1px solid"
        borderColor={surface.border}
        h={height || '15rem'}
      >
        <Box
          position="absolute"
          top="0"
          left="0"
          style={{
            width: width + 'px',
            height: sceneHeight + 'px',
            transform: 'scale(' + scale + ')',
            transformOrigin: 'top left'
          }}
        >
          {scene && scene.background && scene.background.src
            ? draw(Object.assign({}, scene.background, { id: 'background', width: null, height: null, x: 0, y: 0 }), 'background', 0)
            : null}

          {layers.map((layer, index) => draw(layer, layer.id || ('layer-' + index), Number(layer.z) || (index + 1)))}
        </Box>
      </Box>

      <Flex mt="0.5rem" align="center" gap="0.375rem" data-gap="6">
        <Tooltip label={playing ? t('scene.pause') : t('scene.play')} openDelay={400}>
          <IconButton
            size="xs"
            variant="subtle"
            aria-label={playing ? t('scene.pause') : t('scene.play')}
            icon={playing ? <MdPause /> : <MdPlayArrow />}
            onClick={() => setPlaying((current) => !current)}
          />
        </Tooltip>

        <Tooltip label={t('scene.playItAgain')} openDelay={400}>
          <IconButton
            size="xs"
            variant="subtle"
            aria-label={t('scene.playItAgain')}
            icon={<MdReplay />}
            onClick={() => { setRunId((current) => current + 1); setPlaying(true); }}
          />
        </Tooltip>

        <Text fontSize="0.6875rem" color={surface.muted}>
          {width} x {sceneHeight}
        </Text>
      </Flex>
    </Box>
  );
}
