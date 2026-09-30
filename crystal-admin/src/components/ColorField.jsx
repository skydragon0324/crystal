import React, { useRef } from 'react';
import {
  Box, Button, Flex, Input, SimpleGrid, Tooltip, useColorModeValue
} from '@chakra-ui/react';

import { useI18n } from '../i18n';

/**
 * A COLOUR, picked rather than typed.
 *
 * It was a text box asking for a six digit hex, which is a fine way to store a
 * colour and a poor way to choose one: an editor picking a badge for a notice
 * origin had to know that #F59E0B is amber, and the only feedback that they had
 * got it wrong was the swatch in the list afterwards.
 *
 * Three ways in, because they suit three different moments:
 *
 *   THE PALETTE is the usual case. These are the console's own ramp - the same
 *   colours the badges, the status chips and the charts are drawn in - so a
 *   picked origin looks like it belongs to the system rather than beside it.
 *   Ten swatches is a decision; a full spectrum is a project.
 *
 *   THE NATIVE PICKER, behind the last swatch, for the case the palette does
 *   not cover - a partner's brand colour, a campaign. `input type=color` is
 *   the platform's own, which means it is the one the operating system draws,
 *   it has an eyedropper on the machines that have one, and it costs nothing
 *   to ship.
 *
 *   THE HEX FIELD stays, because a colour is often arriving from somewhere
 *   else by copy and paste, and because it is the value that is actually
 *   stored - showing it is what makes the other two legible.
 *
 * EMPTY IS A VALUE. A notice origin with no colour is one that should not
 * stand out, so "none" is offered as a swatch rather than only reachable by
 * clearing the text.
 */

/** A six digit hex. The only thing this field will hand back, or paint. */
const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * The console's own ramp: the brand, then the semantic colours a status badge
 * uses, then two neutrals. Anything outside it goes through the native picker.
 */
export const SWATCHES = [
  { value: '#0EA5E9', label: 'Crystal blue' },
  { value: '#0284C7', label: 'Deep blue' },
  { value: '#8B5CF6', label: 'Violet' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#EF4444', label: 'Red' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#10B981', label: 'Green' },
  { value: '#14B8A6', label: 'Teal' },
  { value: '#64748B', label: 'Slate' },
  { value: '#0F172A', label: 'Ink' }
];

export default function ColorField({ name, value, onChange, isDisabled, placeholder }) {
  const { t } = useI18n();

  const border = useColorModeValue('secondaryGray.100', 'navy.600');
  const muted = useColorModeValue('secondaryGray.600', 'navy.200');

  /*
   * THE PALETTE SITS ON ITS OWN SURFACE, and that surface has to follow the
   * colour mode.
   *
   * Ten saturated squares on the bare modal background is a scatter rather
   * than a control - and in night mode it was worse than untidy: the ring
   * separating each swatch from what is behind it was a black inset shadow,
   * which is invisible on a near-black page. A dark swatch and a dark
   * background simply ran together.
   *
   * So the group gets a panel one step off the dialog, and the ring is white
   * at low opacity in the dark and black at low opacity in the light - the
   * one that contrasts with the page in each case.
   */
  const trayBg = useColorModeValue('secondaryGray.300', 'navy.900');
  const swatchRing = useColorModeValue('rgba(0,0,0,0.16)', 'rgba(255,255,255,0.22)');

  const nativeRef = useRef(null);

  const current = String(value || '');
  const painted = HEX.test(current) ? current : null;

  /* The native input cannot hold "no colour", so it opens on whatever is
     stored - or on the brand, which is the likeliest first choice. */
  const nativeValue = painted || SWATCHES[0].value;

  const pick = (next) => {
    if (isDisabled) return;
    onChange(next);
  };

  return (
    <Box>
      <Flex gap="0.5rem" data-gap="8" align="center">
        {/*
          The swatch beside the field is the stored value, painted - so a hex
          pasted in by hand is checked by eye here rather than on the website.
        */}
        <Box
          w="2.375rem"
          h="2.375rem"
          borderRadius="0.625rem"
          flexShrink={0}
          borderWidth="1px"
          borderColor={border}
          bg={painted || 'transparent'}
          /* Nothing stored reads as a swatch with nothing in it, not as black. */
          backgroundImage={painted ? undefined
            : 'linear-gradient(45deg, rgba(127,127,127,0.25) 25%, transparent 25%, transparent 75%, rgba(127,127,127,0.25) 75%), linear-gradient(45deg, rgba(127,127,127,0.25) 25%, transparent 25%, transparent 75%, rgba(127,127,127,0.25) 75%)'}
          backgroundSize="10px 10px"
          backgroundPosition="0 0, 5px 5px"
        />

        <Input
          name={name}
          size="sm"
          fontSize="sm"
          fontFamily="mono"
          value={current}
          isDisabled={isDisabled}
          placeholder={placeholder || '#0EA5E9'}
          maxLength={7}
          onChange={(event) => {
            const next = event.target.value.trim();
            /* A leading # is typed about half the time and pasted the other
               half; adding it here means both work. */
            pick(next && next.charAt(0) !== '#' ? '#' + next : next);
          }}
        />
      </Flex>

      <SimpleGrid
        columns={11}
        spacing="0.375rem"
        mt="0.625rem"
        maxW="21.25rem"
        bg={trayBg}
        borderWidth="1px"
        borderColor={border}
        borderRadius="0.75rem"
        p="0.5rem"
      >
        {SWATCHES.map((swatch) => (
          <Tooltip key={swatch.value} label={t(swatch.label)} openDelay={400} hasArrow>
            <Box
              as="button"
              type="button"
              aria-label={t(swatch.label)}
              w="1.5rem"
              h="1.5rem"
              borderRadius="0.4375rem"
              bg={swatch.value}
              cursor={isDisabled ? 'not-allowed' : 'pointer'}
              borderWidth="2px"
              borderColor={
                painted && painted.toLowerCase() === swatch.value.toLowerCase()
                  ? 'brand.500'
                  : 'transparent'
              }
              boxShadow={'inset 0 0 0 1px ' + swatchRing}
              onClick={() => pick(swatch.value)}
            />
          </Tooltip>
        ))}

        {/* No colour: for an origin that should not stand out. */}
        <Tooltip label={t('form.noColour')} openDelay={400} hasArrow>
          <Box
            as="button"
            type="button"
            aria-label={t('form.noColour')}
            w="1.5rem"
            h="1.5rem"
            borderRadius="0.4375rem"
            cursor={isDisabled ? 'not-allowed' : 'pointer'}
            borderWidth="2px"
            borderColor={painted ? 'transparent' : 'brand.500'}
            boxShadow={'inset 0 0 0 1px ' + swatchRing}
            position="relative"
            _after={{
              content: '""',
              position: 'absolute',
              left: '2px',
              right: '2px',
              top: '50%',
              height: '1px',
              background: 'currentColor',
              transform: 'rotate(-45deg)'
            }}
            color={muted}
            onClick={() => pick('')}
          />
        </Tooltip>
      </SimpleGrid>

      {/*
        The platform's own picker, for anything the ten do not cover.

        IT IS A BUTTON, not a coloured word. It was bare brand-blue text with
        no border and no background, which on the dark console read as a stray
        link floating under the tray rather than as the third control in a
        group - the two above it are bordered surfaces and this was not. Now
        it is the console's own subtle button, with a spectrum chip in place
        of an icon so it says what it opens without needing the words.

        The input itself is off-screen rather than hidden with display:none,
        because a hidden input cannot be opened by click() in every browser.
      */}
      <Button
        type="button"
        size="sm"
        variant="subtle"
        mt="0.625rem"
        fontSize="xs"
        fontWeight="600"
        isDisabled={isDisabled}
        leftIcon={
          <Box
            w="0.875rem"
            h="0.875rem"
            borderRadius="0.25rem"
            boxShadow={'inset 0 0 0 1px ' + swatchRing}
            bgGradient="linear(to-br, #EF4444, #F59E0B, #10B981, #0EA5E9, #8B5CF6)"
          />
        }
        onClick={() => { if (!isDisabled && nativeRef.current) nativeRef.current.click(); }}
      >
        {t('form.pickAnotherColour')}
      </Button>
      <Input
        ref={nativeRef}
        type="color"
        value={nativeValue}
        onChange={(event) => pick(String(event.target.value).toUpperCase())}
        position="absolute"
        opacity="0"
        w="1px"
        h="1px"
        p="0"
        border="none"
        pointerEvents="none"
        tabIndex={-1}
        aria-hidden="true"
      />
    </Box>
  );
}
