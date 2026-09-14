import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useHistory, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Link,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
  useColorMode,
  useDisclosure
} from '@chakra-ui/react';
import { CheckIcon, CloseIcon, HamburgerIcon, MoonIcon, SearchIcon, SunIcon } from '@chakra-ui/icons';
import { FiBell, FiExternalLink, FiGlobe, FiLogOut, FiUser } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import MegaPanel from './MegaPanel';
import MobileNav from './MobileNav';
import { HEADER_BAR_HEIGHT, PRIMARY_LINKS } from './siteNav';
import { loadCategories, selectCategories } from '@/app/catalogSlice';
import { selectIsSignedIn, selectUser, signOut } from '@/app/authSlice';
import { loadNotices, selectUnseenCount } from '@/app/noticeSlice';
import { ACCOUNT_NAV, hrefOf } from '@/components/account/accountNav';
import { useSurface } from '@/theme/tokens';
import { LOCALES, useI18n } from '@/i18n';

/**
 * The site header: the bar, and a full-bleed mega panel under it.
 *
 * EVERY TOP-LEVEL HEADING OPENS THE PANEL, with its own columns - see
 * siteMenu.menuColumns. It used to be only the two with a category tree
 * behind them, and a bar that answers a hover on two of its six entries
 * teaches the visitor it is not hoverable at all.
 *
 * The panel is a Box inside the sticky header, NOT a Popover - a Popover is
 * sized and positioned against its trigger, and this has to span the whole
 * viewport width. It is fetched lazily on first open, so the category tree
 * costs nothing to a visitor who never opens the menu.
 *
 * The phone menu is a separate component (MobileNav) because mi.com's phone
 * treatment is a sheet that unrolls DOWNWARD from under the header, not a
 * drawer that slides in from the side.
 */
export default function Header() {
  const { t, locale, setLocale } = useI18n();

  const surface = useSurface();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const { colorMode, toggleColorMode } = useColorMode();

  const categories = useSelector(selectCategories);
  const isSignedIn = useSelector(selectIsSignedIn);
  const user = useSelector(selectUser);
  const unseen = useSelector(selectUnseenCount);

  const mobile = useDisclosure();
  const [openMenu, setOpenMenu] = useState(null);
  const [term, setTerm] = useState('');
  const closeTimer = useRef(null);

  // Every route change closes whatever was open - otherwise following a link
  // out of the panel leaves it hanging over the new page.
  useEffect(() => {
    setOpenMenu(null);
    mobile.onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  /*
   * The bell needs the day's notices to have a number on it. The thunk is a
   * no-op once they are loaded, so the header, the arrival dialog and the
   * notification page asking for the same list is one request rather than
   * three.
   */
  useEffect(() => {
    dispatch(loadNotices());
  }, [dispatch]);

  const openPanel = (key) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // Lazy: the tree is only fetched the first time someone reaches for it.
    if (!categories.length) dispatch(loadCategories());
    setOpenMenu(key);
  };

  // A small delay on close so moving the pointer from the trigger down into
  // the panel does not pass through a gap and dismiss it.
  const schedulePanelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140);
  };

  const search = (event) => {
    event.preventDefault();
    if (!term.trim()) return;
    history.push(`/smartphones/products?q=${encodeURIComponent(term.trim())}`);
    setTerm('');
  };

  const accountGroups = ACCOUNT_NAV.filter((group) => group.items.length > 0);

  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="1200"
      onMouseLeave={schedulePanelClose}
    >
      {/*
        * THE ANNOUNCEMENT STRIP IS GONE.
        *
        * It carried one sentence about the OS rollout and a "Register a
        * product" link, on every page, for the life of the site - which is
        * how a strip stops being an announcement and becomes furniture
        * nobody reads. Registering is in the account menu and on the product
        * pages, where somebody holding a new device already is.
        *
        * The header is 32px shorter everywhere as a result; three components
        * stick to `HEADER_HEIGHT` and it moved with it.
        */}
      {/* The bar. backdropFilter sits HERE rather than on the header, because
          a filter on an ancestor would make the phone sheet's position:fixed
          resolve against this element instead of the viewport. */}
      <Box
        h={HEADER_BAR_HEIGHT}
        bg={colorMode === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(14,18,28,0.92)'}
        backdropFilter="saturate(180%) blur(12px)"
        borderBottom="1px solid"
        borderColor={surface.border}
      >
        <Container maxW="container.site" h="100%">
          <Flex align="center" justify="space-between" h="100%" gap="4" data-gap="16">
            <Flex align="center" gap={{ base: 2, lg: 8 }} data-gap="8" data-gap-lg="32" minW="0">
              <IconButton
                display={{ base: 'inline-flex', lg: 'none' }}
                aria-label={mobile.isOpen ? 'Close menu' : 'Open menu'}
                icon={mobile.isOpen ? <CloseIcon boxSize="3" /> : <HamburgerIcon />}
                variant="ghost"
                onClick={mobile.isOpen ? mobile.onClose : mobile.onOpen}
              />

              <Link
                as={RouterLink}
                to="/"
                _hover={{ textDecoration: 'none' }}
                display="flex"
                alignItems="center"
                gap="2" data-gap="8"
                flexShrink={0}
              >
                <Flex
                  align="center"
                  justify="center"
                  boxSize="32px"
                  borderRadius="8px"
                  bgGradient="linear(to-br, brand.400, brand.600)"
                >
                  <Text fontWeight="800" color="white" fontSize="md" lineHeight="1">
                    C
                  </Text>
                </Flex>
                <Text fontWeight="800" fontSize="lg" color={surface.text}>
                  {t('common.crystal')}
                </Text>
              </Link>

              <HStack spacing="6" display={{ base: 'none', lg: 'flex' }}>
                {PRIMARY_LINKS.map((item) =>
                  item.external ? (
                    <Link
                      key={t(item.label)}
                      href={item.href}
                      isExternal
                      fontSize="sm"
                      fontWeight="500"
                      color={surface.strong}
                      _hover={{ color: 'brand.500', textDecoration: 'none' }}
                      /* An external heading opens the panel too - the Eshop
                         and the Appstore are somewhere else to deploy and
                         nowhere else to a member. */
                      onMouseEnter={() => (item.menu ? openPanel(item.menu) : schedulePanelClose())}
                    >
                      {t(item.label)}
                    </Link>
                  ) : (
                    <Link
                      key={t(item.label)}
                      as={RouterLink}
                      to={item.to}
                      fontSize="sm"
                      fontWeight="500"
                      color={
                        location.pathname.indexOf(item.to) === 0 ? 'brand.500' : surface.strong
                      }
                      _hover={{ color: 'brand.500', textDecoration: 'none' }}
                      onMouseEnter={() => (item.menu ? openPanel(item.menu) : schedulePanelClose())}
                    >
                      {t(item.label)}
                    </Link>
                  )
                )}
              </HStack>
            </Flex>

            <HStack spacing="1" flexShrink={0}>
              <Box as="form" onSubmit={search} display={{ base: 'none', xl: 'block' }}>
                <InputGroup size="sm" w="200px">
                  <InputLeftElement pointerEvents="none" h="32px">
                    <SearchIcon color={surface.muted} boxSize="3" />
                  </InputLeftElement>
                  <Input
                    borderRadius="999px"
                    placeholder={t('components.header.searchProducts')}
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                  />
                </InputGroup>
              </Box>

              {/*
                THE BELL, and it is not the compare button that used to be
                here.

                Comparing handsets belongs to the smartphone pages: the tray
                and the compare page only ever hold phones, and an icon in the
                chrome offered it on the Eproducts index, the blog and the
                about page - where clicking it took a visitor out of the
                section they were reading. It now lives where the products
                are, on the pages that have something to compare.

                What a visitor genuinely needs everywhere is the opposite:
                somewhere to find the announcement they closed on arrival.
                The count is what is live today and not yet read on the
                notification page, so it empties when somebody has actually
                looked rather than when they have closed a modal.
              */}
              <IconButton
                as={RouterLink}
                to="/notifications"
                aria-label={
                  unseen > 0
                    ? t('components.header.notificationsUnread', { count: unseen })
                    : t('common.notifications')
                }
                variant="ghost"
                icon={
                  <Box position="relative">
                    <Icon as={FiBell} />
                    {unseen > 0 && (
                      <Flex
                        position="absolute"
                        top="-6px"
                        right="-8px"
                        minW="16px"
                        h="16px"
                        px="1"
                        borderRadius="999px"
                        bg="brand.500"
                        color="white"
                        fontSize="10px"
                        fontWeight="700"
                        align="center"
                        justify="center"
                      >
                        {unseen}
                      </Flex>
                    )}
                  </Box>
                }
              />

              {/*
                THE LANGUAGE, beside the colour mode.

                Two locales, so it is a toggle rather than a menu: a dropdown
                to choose between two things is a click nobody needed. The
                choice is written to storage as well as to state, because the
                API reads it from there for the X-Lang header - so the words
                this site writes and the words the server writes change
                together.
              */}
              {/*
                A GLOBE, not a bare letter.
                
                This was a text button reading "EN" or the Chinese short form,
                which is only legible to somebody who already knows what it
                does - and reads as a stray word next to two icons. The globe
                is the one symbol for this that needs no explanation, and the
                target locale rides beside it so the button still says WHERE it
                goes rather than only what it is.

                Both this and the colour mode leave the bar below md; they are
                in the mobile sheet instead, where there is room to label them.
              */}
              <Menu placement="bottom-end" isLazy>
                <MenuButton
                  as={Button}
                  display={{ base: 'none', md: 'inline-flex' }}
                  variant="ghost"
                  size="sm"
                  fontWeight="600"
                  leftIcon={<Icon as={FiGlobe} boxSize="4" />}
                  iconSpacing="1.5"
                  aria-label={t('components.header.changeLanguage')}
                >
                  {LOCALES.filter((l) => l.code === locale).map((l) => l.short)[0]}
                </MenuButton>

                {/*
                  * A MENU, NOT A TOGGLE.
                  *
                  * It used to swap to the other locale on click and label
                  * itself with where it was GOING, which reads backwards: the
                  * control said 中文 while the site was in English. A menu says
                  * where you ARE on the button and offers the alternatives
                  * below it, with a tick on the current one - and it does not
                  * have to be redesigned the day a third language is added.
                  */}
                <MenuList minW="160px">
                  {LOCALES.map((entry) => (
                    <MenuItem
                      key={entry.code}
                      onClick={() => setLocale(entry.code)}
                      icon={entry.code === locale ? <CheckIcon boxSize="3" /> : <Box boxSize="3" />}
                      fontWeight={entry.code === locale ? '700' : '400'}
                    >
                      {entry.label}
                    </MenuItem>
                  ))}
                </MenuList>
              </Menu>

              <IconButton
                display={{ base: 'none', md: 'inline-flex' }}
                aria-label={colorMode === 'light' ? t('components.header.switchToDarkMode') : t('components.header.switchToLightMode')}
                icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
                variant="ghost"
                onClick={toggleColorMode}
              />

              {/*
                THE ACCOUNT MENU IS A DESKTOP CONTROL.

                On a phone the same list is in the sheet, one tap from the
                hamburger, with room for the group names - and a dropdown of
                thirty entries anchored to a 40px button is not usable there
                anyway. Below md the bar keeps only what a thumb needs: menu,
                logo, notifications, and the way in.
              */}
              {isSignedIn ? (
                <Menu placement="bottom-end" isLazy>
                  <MenuButton
                    as={Button}
                    display={{ base: 'none', md: 'inline-flex' }}
                    variant="ghost"
                    size="sm"
                    leftIcon={<Icon as={FiUser} />}
                    maxW="150px"
                  >
                    <Text isTruncated>{user ? user.nickname : 'Account'}</Text>
                  </MenuButton>
                  {/*
                    * THE SECTIONS ONLY, not every route under them.
                    *
                    * This listed all forty-odd entries grouped under nine
                    * headings, which is the account SIDEBAR reproduced inside
                    * a dropdown - a scrolling list nobody reads, and one that
                    * grows every time a page is added. The sidebar is right
                    * there once you arrive, so the menu's job is only to get
                    * you into the section.
                    *
                    * Each heading opens its FIRST entry, which is the one the
                    * sidebar would have highlighted anyway.
                    */}
                  <MenuList maxH="70vh" overflowY="auto" minW="200px">
                    {accountGroups.map((group) => {
                      const first = group.items[0];

                      return first.external ? (
                        <MenuItem
                          key={group.section}
                          icon={<Icon as={FiExternalLink} />}
                          onClick={() => window.open(first.href, '_blank', 'noopener')}
                        >
                          {t(group.section)}
                        </MenuItem>
                      ) : (
                        <MenuItem
                          key={group.section}
                          onClick={() => history.push(hrefOf(first))}
                        >
                          {t(group.section)}
                        </MenuItem>
                      );
                    })}
                    <MenuDivider />
                    <MenuItem
                      icon={<Icon as={FiLogOut} />}
                      color="red.500"
                      onClick={() => {
                        dispatch(signOut());
                        history.push('/');
                      }}
                    >
                      {t('common.signOut')}
                    </MenuItem>
                  </MenuList>
                </Menu>
              ) : (
                <Button
                  as={RouterLink}
                  to="/login"
                  size="sm"
                  variant="brand"
                  display={{ base: 'none', sm: 'inline-flex' }}
                >
                  {t('common.signIn')}
                </Button>
              )}
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/*
        * ONE PANEL, told which heading is open.
        *
        * Six panels mounted at once would be six copies of the same box
        * animating independently, and moving the pointer along the bar would
        * close one and open another rather than swapping what is inside the
        * one already there.
        */}
      <MegaPanel
        menu={openMenu}
        onMouseEnter={() => openPanel(openMenu)}
        onClose={() => setOpenMenu(null)}
      />

      <MobileNav isOpen={mobile.isOpen} onClose={mobile.onClose} />
    </Box>
  );
}
