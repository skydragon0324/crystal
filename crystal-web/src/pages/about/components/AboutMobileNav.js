import React, { useRef } from 'react';
import {
  Box, Container, Drawer, DrawerBody, DrawerCloseButton, DrawerContent,
  DrawerHeader, DrawerOverlay, Flex, Icon, Text, useDisclosure
} from '@chakra-ui/react';
import { ChevronDownIcon, CheckIcon } from '@chakra-ui/icons';

import { ABOUT_SECTIONS, NAV_HEIGHT } from '../constants';
import { useSurface } from '@/theme/tokens';
import { HEADER_BAR_HEIGHT } from '@/components/layout/siteNav';
import { useT } from '@/i18n';

/**
 * THE CHAPTER SELECTOR, on a screen too narrow for ten labels.
 *
 * It says where you are - "06 / 10 Factory" - and opens the full list only
 * when asked. That is the whole trade: a phone has one screenful, the site
 * header already owns 60px of it, and ten scrolling labels would take the
 * rest while telling a reader less than one line does.
 *
 * DELIBERATELY NOT THE DESKTOP BAR AT A SMALLER SIZE. The two answer different
 * questions - the rail is "jump anywhere", this is "where am I, and what else
 * is there" - and only one of them is worth 52 pixels on a phone.
 *
 * The drawer comes from the BOTTOM, which is where a thumb is.
 *
 * THE JUMP WAITS FOR THE DRAWER TO FINISH CLOSING, and that is not a polish
 * detail - it is the whole reason this used to land on the wrong chapter.
 * A Chakra drawer BLOCKS BODY SCROLLING while it is open and releases the
 * lock when its exit animation completes, so scrolling in the same tick as
 * the close scrolled a document that could not scroll: the page either did
 * not move or moved partly, and then returned to where the reader had been
 * when the lock lifted. Choosing "Factory" left them in Growth.
 *
 * So the chosen chapter is held, the drawer is closed, and the jump happens
 * on `onCloseComplete` - one frame later again, because the measurement that
 * follows reads the layout the released lock has just changed.
 */
export default function AboutMobileNav({ active, onSelect }) {
  const t = useT();
  const surface = useSurface();
  const drawer = useDisclosure();

  const index = Math.max(0, ABOUT_SECTIONS.findIndex((section) => section.id === active));
  const current = ABOUT_SECTIONS[index];

  /* The chapter chosen, held until the drawer has finished getting out of
     the way. See the note above. */
  const pending = useRef(null);

  const choose = (id) => {
    pending.current = id;
    drawer.onClose();
  };

  const jump = () => {
    const id = pending.current;
    if (!id) return;
    pending.current = null;

    /*
     * One frame after the lock is released, so the scroll is measured against
     * a document that is scrollable and laid out. Without it the measurement
     * is taken from the locked layout and lands short by the scrollbar gap.
     */
    window.requestAnimationFrame(function () { onSelect(id); });
  };

  return (
    <>
      <Box
        as="nav"
        aria-label={t('common.aboutCrystalSections')}
        display={{ base: 'block', md: 'none' }}
        position="sticky"
        top={HEADER_BAR_HEIGHT}
        zIndex="1100"
        h={NAV_HEIGHT.base}
        bg={surface.card}
        borderBottom="1px solid"
        borderColor={surface.border}
        boxShadow={surface.shadow}
      >
        <Container maxW="container.site" px="4" h="100%">
          <Flex
            as="button"
            type="button"
            w="100%"
            h="100%"
            align="center"
            justify="space-between"
            gap="3" data-gap="12"
            aria-haspopup="dialog"
            aria-expanded={drawer.isOpen}
            onClick={drawer.onOpen}
          >
            <Flex align="baseline" gap="2" data-gap="8" minW="0">
              <Text fontSize="xs" fontWeight="800" color="brand.500" flexShrink={0}>
                {current.number}
                <Text as="span" color={surface.muted} fontWeight="600"> / 10</Text>
              </Text>
              <Text fontSize="sm" fontWeight="700" color={surface.text} isTruncated>
                {t(current.label)}
              </Text>
            </Flex>

            <Icon
              as={ChevronDownIcon}
              boxSize="5"
              color={surface.muted}
              flexShrink={0}
              transform={drawer.isOpen ? 'rotate(180deg)' : 'none'}
              transition="transform 160ms ease"
            />
          </Flex>
        </Container>
      </Box>

      <Drawer
        isOpen={drawer.isOpen}
        onClose={drawer.onClose}
        onCloseComplete={jump}
        placement="bottom"
      >
        <DrawerOverlay />
        <DrawerContent
          bg={surface.card}
          borderTopRadius="18px"
          maxH="80vh"
        >
          <DrawerCloseButton />
          <DrawerHeader borderBottom="1px solid" borderColor={surface.border} pr="12">
            <Text fontSize="md" fontWeight="700" color={surface.text}>
              {t('layout.aboutCrystal')}
            </Text>
          </DrawerHeader>

          <DrawerBody px="0" py="2">
            {ABOUT_SECTIONS.map((section) => {
              const isActive = section.id === active;

              return (
                <Flex
                  key={section.id}
                  as="button"
                  type="button"
                  w="100%"
                  align="center"
                  gap="3" data-gap="12"
                  px="5"
                  /* Comfortably past the 44px a thumb needs. */
                  minH="52px"
                  textAlign="left"
                  aria-current={isActive ? 'true' : undefined}
                  bg={isActive ? surface.hover : 'transparent'}
                  onClick={() => choose(section.id)}
                >
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    color={isActive ? 'brand.500' : surface.muted}
                    w="24px"
                    flexShrink={0}
                  >
                    {section.number}
                  </Text>
                  <Text
                    flex="1"
                    fontSize="sm"
                    fontWeight={isActive ? '700' : '500'}
                    color={isActive ? 'brand.500' : surface.text}
                  >
                    {t(section.label)}
                  </Text>
                  {/* The tick, so the current chapter is not marked by
                      colour alone. */}
                  {isActive && <Icon as={CheckIcon} boxSize="3.5" color="brand.500" />}
                </Flex>
              );
            })}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
