import React from 'react';
import {
  Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent,
  DrawerHeader, DrawerOverlay, Flex, HStack, IconButton, SimpleGrid,
  Text, Tooltip, useColorMode
} from '@chakra-ui/react';
import { AddIcon, CheckIcon, MinusIcon, MoonIcon, SunIcon } from '@chakra-ui/icons';

import { useAppearance } from '../app/appearance';
import { useI18n, LOCALES } from '../i18n';
import PALETTES, { PALETTE_NAMES } from '../theme/palettes';
import { useSurface } from '../theme/tokens';

/**
 * EVERYTHING ABOUT HOW THE CONSOLE LOOKS, in one place.
 *
 * The language and the colour mode used to be two icons in the navbar, beside
 * the notifications bell and the account menu. That is fine for two and stops
 * working at five: a toolbar of small glyphs with no labels is a memory test,
 * and the three settings added here have no icon that would say what they do.
 *
 * So the toolbar keeps what a person reaches for while working - search,
 * notifications, their account - and everything they set once and forget
 * moves behind one control that says what it is.
 *
 * NO SAVE BUTTON. Every control here applies as it is touched and is written
 * to storage on the way. A preference you have to confirm is a preference you
 * try once and stop adjusting.
 */
export default function SettingsDrawer({ isOpen, onClose }) {
  const { t, locale, setLocale } = useI18n();
  const { colorMode, toggleColorMode } = useColorMode();
  const surface = useSurface();

  const {
    palette, setPalette,
    scale, stepScale, canGrow, canShrink,
    width, setWidth
  } = useAppearance();

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="sm">
      <DrawerOverlay />
      <DrawerContent bg={surface.page}>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" borderColor={surface.border}>
          <Text fontSize="md" fontWeight="700">{t('settings.appearance')}</Text>
          <Text fontSize="xs" fontWeight="400" color="gray.500" mt="0.25rem">
            {t('settings.theseAreKeptOnThis')}
          </Text>
        </DrawerHeader>

        <DrawerBody py="1.25rem">
          <Section label={t('settings.language')} surface={surface}>
            <SimpleGrid columns={1} spacing={2}>
              {LOCALES.map((option) => (
                <Choice
                  key={option.code}
                  isActive={locale === option.code}
                  surface={surface}
                  onClick={() => setLocale(option.code)}
                >
                  {option.label}
                </Choice>
              ))}
            </SimpleGrid>
          </Section>

          <Section label={t('settings.appearanceMode')} surface={surface}>
            <SimpleGrid columns={2} spacing={2}>
              <Choice
                isActive={colorMode === 'light'}
                surface={surface}
                onClick={() => { if (colorMode !== 'light') toggleColorMode(); }}
              >
                <HStack spacing={2}><SunIcon /><Text>{t('settings.light')}</Text></HStack>
              </Choice>
              <Choice
                isActive={colorMode === 'dark'}
                surface={surface}
                onClick={() => { if (colorMode !== 'dark') toggleColorMode(); }}
              >
                <HStack spacing={2}><MoonIcon /><Text>{t('settings.dark')}</Text></HStack>
              </Choice>
            </SimpleGrid>
          </Section>

          <Section label={t('settings.primaryColour')} surface={surface}>
            <HStack spacing={3}>
              {PALETTE_NAMES.map((name) => (
                <Tooltip key={name} label={PALETTES[name].label} openDelay={300}>
                  <Box
                    as="button"
                    type="button"
                    aria-label={PALETTES[name].label}
                    aria-pressed={palette === name}
                    w="2.25rem"
                    h="2.25rem"
                    borderRadius="0.5rem"
                    bg={PALETTES[name].swatch}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    color="white"
                    border="2px solid"
                    borderColor={palette === name ? surface.text : 'transparent'}
                    transition="border-color 140ms ease"
                    onClick={() => setPalette(name)}
                  >
                    {palette === name && <CheckIcon w="0.75rem" h="0.75rem" />}
                  </Box>
                </Tooltip>
              ))}
            </HStack>
          </Section>

          <Section
            label={t('settings.screenScale')}
            hint={t('settings.everythingIsDrawnAtThis')}
            surface={surface}
          >
            <Flex align="center" gap="0.75rem" data-gap="12">
              <IconButton
                aria-label={t('settings.smaller')}
                icon={<MinusIcon w="0.7rem" h="0.7rem" />}
                size="sm"
                variant="outline"
                isDisabled={!canShrink}
                onClick={() => stepScale(-1)}
              />

              <Box
                flex="1"
                textAlign="center"
                fontWeight="700"
                fontSize="lg"
                /*
                 * Tabular figures, so 90% and 100% do not shuffle the buttons
                 * sideways as somebody steps through them.
                 */
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {scale}%
              </Box>

              <IconButton
                aria-label={t('settings.larger')}
                icon={<AddIcon w="0.7rem" h="0.7rem" />}
                size="sm"
                variant="outline"
                isDisabled={!canGrow}
                onClick={() => stepScale(1)}
              />
            </Flex>
          </Section>

          <Section
            label={t('settings.contentWidth')}
            hint={t('settings.staticStopsAtAReadable')}
            surface={surface}
          >
            <SimpleGrid columns={2} spacing={2}>
              <Choice isActive={width === 'static'} surface={surface} onClick={() => setWidth('static')}>
                {t('settings.static')}
              </Choice>
              <Choice isActive={width === 'full'} surface={surface} onClick={() => setWidth('full')}>
                {t('settings.fullWidth')}
              </Choice>
            </SimpleGrid>
          </Section>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/** One labelled group, with the rule that separates it from the next. */
function Section({ label, hint, surface, children }) {
  return (
    <Box mb="1.5rem" pb="1.5rem" borderBottomWidth="1px" borderColor={surface.border} _last={{ borderBottomWidth: 0, mb: 0, pb: 0 }}>
      <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.06em" color="gray.500" mb="0.5rem">
        {label}
      </Text>
      {hint && (
        <Text fontSize="xs" color="gray.500" mb="0.75rem">{hint}</Text>
      )}
      {children}
    </Box>
  );
}

/** A button that is either the current choice or one of the others. */
function Choice({ isActive, surface, onClick, children }) {
  return (
    <Button
      size="sm"
      variant="outline"
      justifyContent="flex-start"
      fontWeight={isActive ? '700' : '400'}
      color={isActive ? 'brand.500' : undefined}
      borderColor={isActive ? 'brand.500' : surface.border}
      bg={isActive ? 'brand.50' : 'transparent'}
      _dark={{ bg: isActive ? 'whiteAlpha.100' : 'transparent' }}
      _hover={{ borderColor: 'brand.500' }}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
