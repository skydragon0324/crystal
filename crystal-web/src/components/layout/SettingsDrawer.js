import React from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Icon,
  SimpleGrid,
  Text,
  useColorMode
} from '@chakra-ui/react';
import { CheckIcon, MoonIcon, SunIcon } from '@chakra-ui/icons';

import { CONTENT_WIDTHS, setContentWidth, useAppearance } from '@/app/appearance';
import { useSurface } from '@/theme/tokens';
import { LOCALES, useI18n } from '@/i18n';

/**
 * EVERYTHING ABOUT HOW THIS SITE LOOKS, behind one control.
 *
 * The header bar carried a globe and a moon, each three characters wide with
 * no label, next to a bell and an account menu. Two unlabelled glyphs is
 * already a memory test and content width would have made it three - and
 * there is no icon for "how wide should the page be" that anybody would read
 * correctly. So the bar keeps what a visitor reaches for WHILE BROWSING -
 * notifications, their account, the way in - and the things they set once and
 * forget moved behind one control that says what it is.
 *
 * THE PHONE DOES NOT LOSE THEM. Below md the language buttons and the colour
 * mode are in the navigation sheet, where they have always been and where
 * there is room to label them; this drawer is the desktop and tablet home for
 * the same settings. Content width is the one thing that is not in the sheet,
 * because below md the column is already the width of the screen and every
 * choice here would do exactly nothing.
 *
 * NO SAVE BUTTON. Every control applies as it is touched and is written to
 * storage on the way past. A preference you have to confirm is a preference
 * people try once and stop adjusting.
 *
 * WHY THE WIDTH TAKES EFFECT WITHOUT A RELOAD, and without re-rendering the
 * page: the setting is a CSS custom property that every Container on the site
 * already resolves through the `container.site` token. See app/appearance.js.
 */
export default function SettingsDrawer({ isOpen, onClose }) {
  const { t, locale, setLocale } = useI18n();
  const { colorMode, toggleColorMode } = useColorMode();
  const surface = useSurface();
  const appearance = useAppearance();

  /*
   * `sm` is 384px, and it is the narrowest size the content actually fits:
   * at `xs` the two width choices sit side by side with "Full width"
   * truncated, which is the one label a reader most needs to read.
   */
  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="sm">
      <DrawerOverlay />
      <DrawerContent bg={surface.page}>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px" borderColor={surface.border}>
          <Text fontSize="md" fontWeight="700" color={surface.text}>
            {t('components.settingsdrawer.display')}
          </Text>
          <Text fontSize="xs" fontWeight="400" color={surface.muted} mt="1">
            {t('components.settingsdrawer.keptInThisBrowser')}
          </Text>
        </DrawerHeader>

        <DrawerBody py="5">
          <Group label={t('components.settingsdrawer.language')} surface={surface}>
            <SimpleGrid columns={1} spacing="2">
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
          </Group>

          <Group label={t('components.settingsdrawer.appearance')} surface={surface}>
            <SimpleGrid columns={2} spacing="2">
              <Choice
                isActive={colorMode === 'light'}
                surface={surface}
                onClick={() => {
                  if (colorMode !== 'light') toggleColorMode();
                }}
              >
                <Icon as={SunIcon} mr="2" />
                {t('layout.lightMode')}
              </Choice>
              <Choice
                isActive={colorMode === 'dark'}
                surface={surface}
                onClick={() => {
                  if (colorMode !== 'dark') toggleColorMode();
                }}
              >
                <Icon as={MoonIcon} mr="2" />
                {t('layout.darkMode')}
              </Choice>
            </SimpleGrid>
          </Group>

          <Group
            label={t('components.settingsdrawer.contentWidth')}
            hint={t('components.settingsdrawer.howWideThePageColumn')}
            surface={surface}
          >
            <SimpleGrid columns={2} spacing="2">
              {CONTENT_WIDTHS.map((option) => (
                <Choice
                  key={option.id}
                  isActive={appearance.contentWidth === option.id}
                  surface={surface}
                  onClick={() => setContentWidth(option.id)}
                >
                  {t(option.label)}
                </Choice>
              ))}
            </SimpleGrid>

            {/*
              A PICTURE OF THE CHOICE, because the words do not carry it.
              "Wide" and "Standard" mean nothing until you have tried both,
              and the drawer covers the page you would be comparing them on -
              so the bar redraws itself at the chosen proportion as a preview
              of what is behind it.
            */}
            <Box mt="4" h="10px" borderRadius="full" bg={surface.raised} overflow="hidden">
              <Box
                h="100%"
                borderRadius="full"
                bg="brand.500"
                mx="auto"
                transition="width 200ms ease"
                width={previewWidth(appearance.contentWidth)}
              />
            </Box>
          </Group>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/** Roughly what share of a wide screen each choice fills. */
function previewWidth(id) {
  const shares = { compact: '48%', standard: '58%', wide: '74%', full: '100%' };
  return shares[id] || shares.standard;
}

/** One labelled group, with the rule that separates it from the next. */
function Group({ label, hint, surface, children }) {
  return (
    <Box
      mb="6"
      pb="6"
      borderBottomWidth="1px"
      borderColor={surface.border}
      _last={{ borderBottomWidth: 0, mb: 0, pb: 0 }}
    >
      <Text
        fontSize="xs"
        fontWeight="700"
        textTransform="uppercase"
        letterSpacing="0.06em"
        color={surface.muted}
        mb="2"
      >
        {label}
      </Text>
      {hint && (
        <Text fontSize="xs" color={surface.muted} mb="3" lineHeight="1.6">
          {hint}
        </Text>
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
      fontWeight={isActive ? '700' : '500'}
      color={isActive ? 'brand.500' : surface.strong}
      borderColor={isActive ? 'brand.500' : surface.border}
      bg="transparent"
      aria-pressed={isActive}
      _hover={{ borderColor: 'brand.500' }}
      onClick={onClick}
    >
      <Flex align="center" w="100%" minW="0">
        <Box as="span" flex="1" textAlign="left" isTruncated>
          {children}
        </Box>
        {isActive && <CheckIcon boxSize="3" ml="2" flexShrink={0} />}
      </Flex>
    </Button>
  );
}
