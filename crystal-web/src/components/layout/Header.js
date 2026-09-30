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
import { CloseIcon, HamburgerIcon } from '@chakra-ui/icons';
import { FiBell, FiChevronDown, FiExternalLink, FiLogOut, FiSliders, FiUser } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import MegaPanel, { MENU_PANEL_ID } from './MegaPanel';
import MobileNav, { MOBILE_NAV_ID } from './MobileNav';
import SettingsDrawer from './SettingsDrawer';
import { HEADER_BAR_HEIGHT, SITE_BAR, currentEntry } from './siteNav';
import { selectAuthStatus, selectIsSignedIn, selectUser, signOut } from '@/app/authSlice';
import { countUnseen, loadNotices, selectNotices, selectSeenNoticeIds } from '@/app/noticeSlice';
import { ACCOUNT_MENU, accountName } from '@/components/account/accountNav';
import { useListedNotices } from '@/components/security/VerifiedNotification';
import { useSurface } from '@/theme/tokens';
import useSignIn from '@/hooks/useSignIn';
import { useI18n } from '@/i18n';

/**
 * The site header: the bar, and a full-bleed menu panel under it.
 *
 * THE BAR AND THE PANEL ARE THE PHONE'S MENU, laid out for a desktop. Both
 * are drawn from siteNav.SITE_NAV - the same list MobileNav draws - so the
 * Eshop that opens onto the member's pages on a phone opens onto the same
 * pages here, with the same link out to the store last. It used to be a bare
 * external link on a desktop, and that is the difference that list exists to
 * make impossible; tests/menuParity.test.js mounts both menus and compares.
 *
 * A BRANCH IS A BUTTON, A LEAF IS A LINK. A heading with links under it
 * (Smartphones, Eproducts, the two stores) is a disclosure button: a click,
 * Enter or Space opens the panel, `aria-expanded` says so, Escape closes it
 * and hands focus back to the heading. Opened from the keyboard, focus moves
 * into that heading's own column, because the panel sits after the whole bar
 * in the tab order and a Tab from the heading would otherwise walk along the
 * bar instead of into the menu it just opened. A heading with nothing under
 * it (Blog, About) is a link, and goes there - as its row does on the phone.
 *
 * HOVER STILL OPENS IT, as an addition and not the only way in. Every heading
 * answers the pointer - a bar that reacted on two of its six entries taught
 * the visitor it was not hoverable at all - and a panel opened by hovering
 * closes when the pointer leaves. One opened by a click or a key STAYS until
 * it is dismissed (Escape, a second click, a click elsewhere, focus leaving
 * the header), because a menu that vanishes when the pointer drifts off it is
 * not one a keyboard or a trackpad user can rely on.
 *
 * The panel is a Box inside the sticky header, NOT a Popover - a Popover is
 * sized and positioned against its trigger, and this has to span the whole
 * viewport width. Nothing in it is fetched.
 *
 * The phone menu is a separate component (MobileNav) because mi.com's phone
 * treatment is a sheet that unrolls DOWNWARD from under the header, not a
 * drawer that slides in from the side - a different LAYOUT of the same list.
 *
 * THERE IS NO SEARCH BOX IN THE BAR ANY MORE. It was a 200px input that
 * appeared only at xl - so on every window narrower than 1280px the site
 * had no search at all, and nothing anywhere said so. What it did was push
 * `?q=` at the smartphone product list, which is one section of a catalogue
 * that also holds televisions, set-top boxes and cameras: a visitor who
 * typed the name of a television was told there were no results. The
 * product list still reads `?q=` out of the URL, so links and bookmarks that
 * carry a search keep working; nothing in the chrome starts one.
 *
 * THE LANGUAGE AND THE COLOUR MODE ARE NOT IN THE BAR EITHER. They are in
 * the settings drawer, with content width beside them - see SettingsDrawer.
 */
export default function Header() {
  const { t } = useI18n();

  const surface = useSurface();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  /* Only the bar tint is read here now; the SWITCH lives in the settings drawer. */
  const { colorMode } = useColorMode();

  const isSignedIn = useSelector(selectIsSignedIn);
  const signingIn = useSelector(selectAuthStatus) === 'pending';
  const user = useSelector(selectUser);
  const signIn = useSignIn();

  /*
   * The bell counts what the notification page will LIST - the notices that
   * verified - so it never promises one the page cannot show. Until the
   * checks are in there is no number rather than one that is about to drop;
   * the verifier's cache means this and the dialog check each notice once.
   */
  const liveNotices = useSelector(selectNotices);
  const seenNoticeIds = useSelector(selectSeenNoticeIds);
  const listedNotices = useListedNotices(liveNotices);
  const unseen = countUnseen(listedNotices.notices, seenNoticeIds);

  const mobile = useDisclosure();
  const settings = useDisclosure();

  /* Which heading has the panel open, or null; and whether it was a click or
     a key that opened it (it stays) rather than the pointer (it follows it). */
  const [openMenu, setOpenMenu] = useState(null);
  const [pinned, setPinned] = useState(false);
  /* A column to move focus into once the panel is drawn - see the effect below. */
  const [focusRequest, setFocusRequest] = useState(null);
  const closeTimer = useRef(null);
  const headerRef = useRef(null);
  const panelRef = useRef(null);
  /* Every heading's element by key, so focus can be handed back to it. */
  const headings = useRef({});

  const current = currentEntry(location.pathname);

  // Every route change closes whatever was open - otherwise following a link
  // out of the panel leaves it hanging over the new page.
  useEffect(() => {
    setOpenMenu(null);
    setPinned(false);
    mobile.onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  /*
   * FOCUS GOES INTO THE COLUMN AFTER THE PANEL IS DRAWN, not in the handler:
   * until the render that opens it has committed, the panel is still
   * `visibility: hidden` and its links refuse focus. A fresh object per
   * request, so asking twice for the same column still runs this.
   */
  useEffect(() => {
    if (!focusRequest || !panelRef.current) return;
    const first = panelRef.current.querySelector(`[data-menu-column="${focusRequest.key}"] a`);
    if (first) first.focus();
  }, [focusRequest]);

  /*
   * A CLICK ANYWHERE ELSE CLOSES A PANEL THAT WAS CLICKED OPEN. One opened by
   * hovering closes on its own when the pointer leaves; this is for the one
   * that stays, and it is only listened for while something is open.
   */
  useEffect(() => {
    if (!openMenu) return undefined;
    const onDown = (event) => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setOpenMenu(null);
        setPinned(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

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
    setOpenMenu(key);
  };

  /* Closes the panel; `returnFocus` hands focus back to the heading that had it. */
  const closePanel = (returnFocus) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const opener = openMenu ? headings.current[openMenu] : null;
    setOpenMenu(null);
    setPinned(false);
    if (returnFocus && opener) opener.focus();
  };

  // A small delay on close so moving the pointer from the trigger down into
  // the panel does not pass through a gap and dismiss it. A panel that was
  // clicked open is not the pointer's to close.
  const schedulePanelClose = () => {
    if (pinned) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140);
  };

  /*
   * A BRANCH HEADING'S CLICK - which is also its Enter and its Space, because
   * a <button> turns both into a click. `detail` is 0 for a click that came
   * from a key (and from assistive technology), so that is when focus is
   * moved into the column; a mouse click leaves focus where the mouse is.
   *
   * A panel the pointer opened is PINNED by the click rather than toggled
   * shut: the hover got there first, and closing the menu somebody just
   * clicked to open reads as the click being ignored. The second click closes.
   */
  const onHeadingClick = (key) => (event) => {
    if (openMenu === key && pinned) {
      closePanel(false);
      return;
    }
    openPanel(key);
    setPinned(true);
    if (event.detail === 0) setFocusRequest({ key });
  };

  /* Arrow Down on a heading opens it as well, and always goes into the column. */
  const onHeadingKeyDown = (key) => (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'Down') return;
    event.preventDefault();
    openPanel(key);
    setPinned(true);
    setFocusRequest({ key });
  };

  /*
   * ESCAPE, from anywhere in the header - a heading or a link in the panel.
   * Focus goes back to the heading that opened it only when focus is in the
   * header at all: a panel the pointer opened should close on Escape without
   * pulling focus away from wherever the reader actually is.
   */
  const onHeaderKeyDown = (event) => {
    if (!openMenu || (event.key !== 'Escape' && event.key !== 'Esc')) return;
    const inside = headerRef.current && headerRef.current.contains(document.activeElement);
    closePanel(inside);
  };

  /* Focus leaving the header for somewhere else on the page closes the panel. */
  const onHeaderBlur = (event) => {
    if (!openMenu || !event.relatedTarget) return;
    if (headerRef.current && headerRef.current.contains(event.relatedTarget)) return;
    closePanel(false);
  };

  return (
    <Box
      ref={headerRef}
      as="header"
      position="sticky"
      top="0"
      zIndex="1200"
      onMouseLeave={schedulePanelClose}
      onKeyDown={onHeaderKeyDown}
      onBlur={onHeaderBlur}
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
                aria-label={mobile.isOpen ? t('layout.header.closeMenu') : t('layout.header.openMenu')}
                aria-expanded={mobile.isOpen}
                aria-controls={MOBILE_NAV_ID}
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

              {/*
                * THE MAIN MENU, and the panel it opens INSIDE it.
                *
                * The panel is positioned against the header, so where it
                * sits in the markup is free - and inside the nav is where it
                * belongs: it is the same landmark to a screen reader, and it
                * comes straight after the headings in the reading order
                * instead of after the bell, the settings and the account.
                *
                * ONE PANEL, told which heading is open. A panel per heading
                * would be six copies of the same box animating on their own,
                * and moving along the bar would close one and open another
                * rather than changing which column is marked in the one that
                * is already there.
                */}
              <Box as="nav" aria-label={t('layout.mainMenu')} display={{ base: 'none', lg: 'block' }}>
                {/*
                  * ONE LINE PER HEADING, whatever the language. The stores are
                  * "Crystal Eshop" and "Crystal Appstore" here as on the phone,
                  * and at the narrow end of a desktop (lg, 992px) a heading that
                  * may wrap turns into two stacked words that read as two
                  * headings; the gap narrows below xl instead. Measured, signed
                  * in, in Russian (the widest): at 992px the last heading ends
                  * clear of the bell only with the 12px gap and the 12px chevron.
                  */}
                <HStack as="ul" spacing={{ base: 3, xl: 6 }} listStyleType="none" m="0" p="0">
                  {SITE_BAR.map((entry) => {
                    const isOpen = openMenu === entry.key;
                    const color = isOpen || current === entry.key ? 'brand.500' : surface.strong;
                    const remember = (element) => { headings.current[entry.key] = element; };

                    return (
                      <Box as="li" key={entry.key}>
                        {entry.links ? (
                          <Box
                            as="button"
                            type="button"
                            ref={remember}
                            aria-expanded={isOpen}
                            aria-controls={MENU_PANEL_ID}
                            display="inline-flex"
                            alignItems="center"
                            whiteSpace="nowrap"
                            py="1"
                            fontSize="sm"
                            fontWeight="500"
                            color={color}
                            _hover={{ color: 'brand.500' }}
                            onClick={onHeadingClick(entry.key)}
                            onKeyDown={onHeadingKeyDown(entry.key)}
                            onMouseEnter={() => openPanel(entry.key)}
                          >
                            {t(entry.label)}
                            {/*
                              * THE CHEVRON IS THE PHONE'S CHEVRON, turned to
                              * point down: the same mark on the same headings
                              * says "this opens" on both, and its absence on
                              * Blog and About says "this goes there".
                              */}
                            <Icon
                              as={FiChevronDown}
                              boxSize="3"
                              ml="0.5"
                              aria-hidden="true"
                              transform={isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
                              transition="transform 150ms ease"
                            />
                          </Box>
                        ) : (
                          /*
                           * A STORE IS A PLAIN LINK, with no icon beside it
                           * and NO NEW TAB: the Eshop and the Appstore are
                           * Crystal to the people shopping in them, so a mark
                           * that says "you are leaving" reads as a warning
                           * about Crystal's own shops, and a second tab is a
                           * window to close rather than a journey continued.
                           * They are followed in place, like any other
                           * heading. Every surface draws them the same way -
                           * MegaPanel and MobileNav - see siteNav.js.
                           */
                          <Link
                            {...(entry.external
                              ? { href: entry.href }
                              : { as: RouterLink, to: entry.to })}
                            ref={remember}
                            display="inline-block"
                            whiteSpace="nowrap"
                            py="1"
                            fontSize="sm"
                            fontWeight="500"
                            color={color}
                            aria-current={current === entry.key ? 'page' : undefined}
                            _hover={{ color: 'brand.500', textDecoration: 'none' }}
                            onMouseEnter={() => openPanel(entry.key)}
                          >
                            {t(entry.label)}
                          </Link>
                        )}
                      </Box>
                    );
                  })}
                </HStack>

                <MegaPanel
                  ref={panelRef}
                  menu={openMenu}
                  onMouseEnter={() => openPanel(openMenu)}
                  onClose={() => closePanel(false)}
                />
              </Box>
            </Flex>

            <HStack spacing="1" flexShrink={0}>
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
                The count is what is live today, verified, and not yet read
                on the notification page, so it empties when somebody has
                actually looked rather than when they have closed a modal.
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
                ONE CONTROL FOR EVERYTHING ABOUT HOW THE SITE LOOKS.

                This was two: a globe that opened a list of languages, and a
                moon that swapped the colour mode. Both were unlabelled, both
                were hidden below md, and adding content width beside them
                would have made three glyphs in a row that a visitor has to
                learn by clicking. A single labelled control that says
                Settings is one thing to find and holds as many preferences
                as the site grows.

                It is still hidden below md, and for the same reason the
                other two were: the phone has all of this in the navigation
                sheet, with room to write out what each one does.
              */}
              <IconButton
                display={{ base: 'none', md: 'inline-flex' }}
                aria-label={t('components.header.settings')}
                icon={<Icon as={FiSliders} />}
                variant="ghost"
                onClick={settings.onOpen}
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
                    /* 140px from lg to xl: the bar's headings need the last few
                       pixels there - see ONE LINE PER HEADING above. */
                    maxW={{ base: '150px', lg: '140px', xl: '150px' }}
                  >
                    <Text isTruncated>{accountName(user, t)}</Text>
                  </MenuButton>
                  {/*
                    * THE PHONE'S ACCOUNT ROWS, and no deeper.
                    *
                    * The rows, their order and their words are ACCOUNT_MENU's,
                    * which the phone sheet and the sidebar draw too - so a
                    * group of one is its page ("Dashboard", "My Articles")
                    * here as it is there, where this used to say "Overview"
                    * and "Blog" while the phone said something else.
                    *
                    * NO SUB-ENTRIES, which was asked for: forty-odd routes in
                    * a dropdown is the sidebar reproduced as a scrolling list
                    * nobody reads. A branch goes to its FIRST page instead,
                    * where the sidebar has that same branch open - which is
                    * the desktop's version of the phone's drill-down.
                    *
                    * Real links, not click handlers, so a row can be opened
                    * in a new tab like any other link on the page.
                    */}
                  <MenuList maxH="70vh" overflowY="auto" minW="200px">
                    {ACCOUNT_MENU.map((entry) => (
                      entry.external ? (
                        <MenuItem
                          key={entry.key}
                          as="a"
                          href={entry.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          icon={<Icon as={FiExternalLink} />}
                        >
                          {t(entry.label)}
                        </MenuItem>
                      ) : (
                        <MenuItem key={entry.key} as={RouterLink} to={entry.href}>
                          {t(entry.label)}
                        </MenuItem>
                      )
                    ))}
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
                  onClick={signIn}
                  isLoading={signingIn}
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

      <MobileNav isOpen={mobile.isOpen} onClose={mobile.onClose} />

      <SettingsDrawer isOpen={settings.isOpen} onClose={settings.onClose} />
    </Box>
  );
}
