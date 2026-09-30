import React, { useRef, useState } from 'react';
import {
  Box, Button, Flex, Grid, IconButton, Input, Text, Tooltip, useToast
} from '@chakra-ui/react';
import {
  MdAdd, MdArrowDownward, MdArrowUpward, MdDelete, MdCloudUpload, MdImage
} from 'react-icons/md';

import SelectField from '../SelectField';
import SceneStage from './SceneStage';
import { media } from '../../api';
import { useSurface } from '../../theme/tokens';
import { useT } from '../../i18n';
import {
  ANIMATION_OPTIONS, EASING_OPTIONS, emptyLayer, emptyScene
} from './sceneAnimations';
import { PRESETS, sceneFromPreset } from './scenePresets';

/**
 * THE SCENE EDITOR: an advert that moves, built layer by layer.
 *
 * An advert is normally one picture, and this screen is what makes it a
 * background with things arriving over it - the specification's section 9.
 * The form on the left describes the scene; the preview on the right IS the
 * scene, playing, so a delay of two seconds is something an operator watches
 * rather than imagines.
 *
 * THE PICTURES UPLOAD AS THEY ARE PICKED, and that is a departure from every
 * other image field in this console, which holds the file until Save. The
 * reason is the preview: a layer's picture has to have an address before it
 * can be drawn, and a scene being built blind is the thing this screen exists
 * to prevent. The cost is that abandoning a half-built scene leaves the
 * uploaded layers behind - they are visible and removable in the media
 * library, and the server frees them when nothing references them.
 *
 * WHAT IT WILL NOT LET AN OPERATOR DO is store anything the storefront cannot
 * draw: the animation names come from one list, the numbers are numbers, and
 * the server rebuilds the whole scene from known fields when it saves it
 * (utils/scene.js). This screen is the comfortable path, not the guard.
 */
export default function SceneEditor({ value, folder, isDisabled, onChange }) {
  const t = useT();
  const surface = useSurface();
  const toast = useToast();

  const fileInput = useRef(null);
  /* Which layer a picked file belongs to: an index, or 'background'. */
  const pickingFor = useRef(null);
  const [busy, setBusy] = useState(false);

  const scene = value && typeof value === 'object' ? value : null;
  const layers = scene && Array.isArray(scene.layers) ? scene.layers : [];

  const change = (next) => onChange(next);

  const changeLayer = (index, patch) => {
    const next = Object.assign({}, scene);
    next.layers = layers.slice();
    next.layers[index] = Object.assign({}, next.layers[index], patch);
    change(next);
  };

  const changeAnimation = (index, patch) => {
    const layer = layers[index];
    changeLayer(index, { animation: Object.assign({}, layer.animation, patch) });
  };

  const move = (index, by) => {
    const to = index + by;
    if (to < 0 || to >= layers.length) return;

    const next = Object.assign({}, scene);
    next.layers = layers.slice();
    const held = next.layers[index];
    next.layers[index] = next.layers[to];
    next.layers[to] = held;
    change(next);
  };

  const remove = (index) => {
    const next = Object.assign({}, scene);
    next.layers = layers.filter((layer, at) => at !== index);
    change(next);
  };

  const add = () => {
    const next = Object.assign({}, scene || emptyScene());
    next.layers = (next.layers || []).concat([emptyLayer(layers.length)]);
    change(next);
  };

  /* The one file input, aimed at whichever layer asked for it. */
  const pick = (target) => {
    pickingFor.current = target;
    if (fileInput.current) fileInput.current.click();
  };

  const upload = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const target = pickingFor.current;
    setBusy(true);

    try {
      const response = await media.upload(folder || 'showcase', file);
      const src = response.data.file_path;

      if (target === 'background') {
        const next = Object.assign({}, scene || emptyScene());
        next.background = Object.assign({}, next.background, { src: src });
        change(next);
      } else {
        changeLayer(target, { src: src });
      }
    } catch (error) {
      toast({
        status: 'error',
        title: t('scene.thatPictureCouldNotBeUploaded'),
        description: (error && error.message) || undefined
      });
    } finally {
      setBusy(false);
    }
  };

  if (!scene) {
    return (
      <Box>
        <Text fontSize="sm" color={surface.muted} mb="0.5rem">
          {t('scene.anAdvertIsOnePictureUntil')}
        </Text>

        {/*
          * START FROM A SHAPE, OR FROM NOTHING.
          *
          * A preset is the timing already worked out - which layer arrives
          * when, and over how long - with the pictures left to upload. It is
          * the difference between building an advert and guessing at
          * twenty-eight numbers to find out what a stagger looks like.
          */}
        <Flex gap="0.375rem" data-gap="6" data-gap-wrap wrap="wrap">
          {PRESETS.map((preset) => (
            <Tooltip key={preset.name} label={t(preset.hint)} openDelay={400}>
              <Button
                size="sm"
                variant="subtle"
                isDisabled={isDisabled}
                onClick={() => change(sceneFromPreset(preset))}
              >
                {t(preset.label)}
              </Button>
            </Tooltip>
          ))}

          <Button
            size="sm"
            variant="quiet"
            leftIcon={<MdAdd />}
            isDisabled={isDisabled}
            onClick={() => change(emptyScene())}
          >
            {t('scene.startFromNothing')}
          </Button>
        </Flex>
      </Box>
    );
  }

  const number = (label, current, onNumber, width) => (
    <Box w={width || '4.5rem'}>
      <Text fontSize="0.625rem" color={surface.muted} mb="0.125rem">{label}</Text>
      <Input
        size="xs"
        type="number"
        value={current === undefined || current === null ? '' : current}
        isReadOnly={isDisabled}
        onChange={(event) => onNumber(event.target.value === '' ? '' : Number(event.target.value))}
      />
    </Box>
  );

  return (
    <Box>
      <Grid templateColumns={{ base: '1fr', xl: 'minmax(0, 1fr) minmax(0, 22rem)' }} gap="1rem" data-gap="16">
        <Box minW="0">
          {/* ---- the frame the layers are placed in ---- */}
          <Flex align="flex-end" gap="0.5rem" data-gap="8" data-gap-wrap wrap="wrap" mb="0.75rem">
            {number(t('scene.frameWidth'), scene.width, (n) => change(Object.assign({}, scene, { width: n })), '5.5rem')}
            {number(t('scene.frameHeight'), scene.height, (n) => change(Object.assign({}, scene, { height: n })), '5.5rem')}
            {number(t('scene.lengthMs'), scene.duration, (n) => change(Object.assign({}, scene, { duration: n })), '6rem')}

            <Button
              size="xs"
              variant="quiet"
              color="red.400"
              isDisabled={isDisabled}
              onClick={() => change(null)}
            >
              {t('scene.backToOnePicture')}
            </Button>
          </Flex>

          {/* ---- the background ---- */}
          <Box
            p="0.625rem"
            borderRadius="0.5rem"
            bg={surface.raised}
            border="1px solid"
            borderColor={surface.border}
            mb="0.75rem"
          >
            <Flex align="center" gap="0.5rem" data-gap="8" data-gap-wrap wrap="wrap">
              <Text fontSize="xs" fontWeight="600" minW="5rem">{t('scene.background')}</Text>

              <Button
                size="xs"
                variant="subtle"
                leftIcon={<MdCloudUpload />}
                isDisabled={isDisabled || busy}
                onClick={() => pick('background')}
              >
                {scene.background && scene.background.src ? t('scene.replace') : t('form.upload')}
              </Button>

              <Box flex="1" minW="10rem">
                <Input
                  size="xs"
                  placeholder="/uploads/…"
                  value={(scene.background && scene.background.src) || ''}
                  isReadOnly={isDisabled}
                  onChange={(event) => change(Object.assign({}, scene, {
                    background: Object.assign({}, scene.background, { src: event.target.value })
                  }))}
                />
              </Box>

              <Box w="9rem">
                <SelectField
                  size="sm"
                  value={(scene.background && scene.background.animation && scene.background.animation.name) || 'zoom-out'}
                  options={ANIMATION_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
                  isSearchable={false}
                  isDisabled={isDisabled}
                  onChange={(name) => change(Object.assign({}, scene, {
                    background: Object.assign({}, scene.background, {
                      animation: Object.assign({}, scene.background && scene.background.animation, { name: name })
                    })
                  }))}
                />
              </Box>
            </Flex>
          </Box>

          {/* ---- the layers ---- */}
          {layers.map((layer, index) => (
            <Box
              key={index}
              p="0.625rem"
              mb="0.5rem"
              borderRadius="0.5rem"
              bg={surface.card}
              border="1px solid"
              borderColor={surface.border}
            >
              <Flex align="center" gap="0.375rem" data-gap="6" data-gap-wrap mb="0.5rem" wrap="wrap">
                <Box
                  w="2.25rem" h="2.25rem" flexShrink={0}
                  borderRadius="0.375rem" overflow="hidden"
                  bg={surface.raised}
                  display="flex" alignItems="center" justifyContent="center"
                >
                  {layer.src
                    ? <Box as="img" src={layer.src} alt="" w="100%" h="100%" sx={{ objectFit: 'cover' }} />
                    : <MdImage color={surface.muted} />}
                </Box>

                <Input
                  size="xs"
                  w="7rem"
                  value={layer.id || ''}
                  placeholder={t('scene.layerName')}
                  isReadOnly={isDisabled}
                  onChange={(event) => changeLayer(index, { id: event.target.value })}
                />

                <Button
                  size="xs"
                  variant="subtle"
                  leftIcon={<MdCloudUpload />}
                  isDisabled={isDisabled || busy}
                  onClick={() => pick(index)}
                >
                  {layer.src ? t('scene.replace') : t('form.upload')}
                </Button>

                <Box flex="1" />

                <Tooltip label={t('scene.moveUp')} openDelay={400}>
                  <IconButton
                    size="xs" variant="quiet" aria-label={t('scene.moveUp')}
                    icon={<MdArrowUpward />} isDisabled={isDisabled || index === 0}
                    onClick={() => move(index, -1)}
                  />
                </Tooltip>
                <Tooltip label={t('scene.moveDown')} openDelay={400}>
                  <IconButton
                    size="xs" variant="quiet" aria-label={t('scene.moveDown')}
                    icon={<MdArrowDownward />} isDisabled={isDisabled || index === layers.length - 1}
                    onClick={() => move(index, 1)}
                  />
                </Tooltip>
                <Tooltip label={t('common.delete')} openDelay={400}>
                  <IconButton
                    size="xs" variant="quiet" color="red.400" aria-label={t('common.delete')}
                    icon={<MdDelete />} isDisabled={isDisabled}
                    onClick={() => remove(index)}
                  />
                </Tooltip>
              </Flex>

              <Flex gap="0.5rem" data-gap="8" data-gap-wrap wrap="wrap" align="flex-end">
                {number('x', layer.x, (n) => changeLayer(index, { x: n }))}
                {number('y', layer.y, (n) => changeLayer(index, { y: n }))}
                {number(t('scene.w'), layer.width, (n) => changeLayer(index, { width: n }))}
                {number(t('scene.h'), layer.height, (n) => changeLayer(index, { height: n }))}

                <Box w="9rem">
                  <Text fontSize="0.625rem" color={surface.muted} mb="0.125rem">{t('scene.animation')}</Text>
                  <SelectField
                    size="sm"
                    value={(layer.animation && layer.animation.name) || 'fade-in'}
                    options={ANIMATION_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
                    isSearchable={false}
                    isDisabled={isDisabled}
                    onChange={(name) => changeAnimation(index, { name: name })}
                  />
                </Box>

                {number(t('scene.delayMs'), layer.animation && layer.animation.delay,
                  (n) => changeAnimation(index, { delay: n }), '5rem')}
                {number(t('scene.overMs'), layer.animation && layer.animation.duration,
                  (n) => changeAnimation(index, { duration: n }), '5rem')}

                <Box w="8.5rem">
                  <Text fontSize="0.625rem" color={surface.muted} mb="0.125rem">{t('scene.easing')}</Text>
                  <SelectField
                    size="sm"
                    value={(layer.animation && layer.animation.easing) || 'ease-out'}
                    options={EASING_OPTIONS}
                    isSearchable={false}
                    isDisabled={isDisabled}
                    onChange={(easing) => changeAnimation(index, { easing: easing })}
                  />
                </Box>
              </Flex>
            </Box>
          ))}

          <Button
            size="xs"
            variant="subtle"
            leftIcon={<MdAdd />}
            isDisabled={isDisabled || layers.length >= 12}
            onClick={add}
          >
            {t('scene.addALayer')}
          </Button>
        </Box>

        {/* ---- what it looks like ---- */}
        <Box minW="0" position={{ base: 'static', xl: 'sticky' }} top="0" alignSelf="flex-start">
          <Text fontSize="xs" fontWeight="600" mb="0.375rem">{t('scene.preview')}</Text>
          <SceneStage scene={scene} height="12rem" />
        </Box>
      </Grid>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        style={{ display: 'none' }}
        onChange={upload}
      />
    </Box>
  );
}
