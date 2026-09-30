import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useHistory, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  Link,
  Stack,
  Text,
  useColorMode
} from '@chakra-ui/react';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import {
  FiChevronLeft,
  FiChevronRight,
  FiGlobe,
  FiGrid,
  FiLogOut,
  FiUser
} from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import { branchLinks, HEADER_BAR_HEIGHT, PHONE_BRANCHES, SITE_PHONE } from './siteNav';
import { selectIsSignedIn, selectUser, signOut } from '@/app/authSlice';
import { ACCOUNT_MENU, accountName, hrefOf } from '@/components/account/accountNav';
import { useSurface } from '@/theme/tokens';
import useSignIn from '@/hooks/useSignIn';
import { LOCALES, useI18n } from '@/i18n';

/**
 * The phone menu: mi.com's sheet, and mi.com's DRILL-DOWN.
 *
 * A full-width panel unrolls downward from under the header, and inside it one
 * list slides sideways to the next. A branch replaces the list you tapped it
 * from and puts a BACK row at the top; there is never more than one level.
 *
 * TWO ROOTS, NOT ONE, AND THE ROUTE PICKS WHICH.
 *
 * A signed-in member reading an account page wants the account menu; the same
 * member on a product page wants the site menu. Opening on the wrong one costs
 * a tap every single time, so the sheet reads the route as it opens and starts
 * on the matching root. Either is one row from the other, so nothing is more
 * than a tap away.
 *
 * AND THE ACCOUNT MENU IS BUILT LIKE THE SITE MENU - groups that drill down,
 * not a flat list under headings. It has ten groups and twenty-seven entries;
 * as one scroll it was a wall of text, where the site menu at half the size
 * was eight rows. The same structure for both means one thing to learn.
 *
 * Four details that are easy to get wrong and are handled here:
 *
 *   - the sheet needs an OUTER clipping box with overflow:hidden and the
 *     sliding panel inside it. A single transformed element is visibly seen
 *     travelling up across the header on the way in.
 *   - the page behind must have its scroll frozen while the sheet is open, or
 *     a flick meant for the menu scrolls the page underneath instead.
 *   - each column scrolls ITSELF, not the track. A track that scrolls takes
 *     the root list's scroll position into the branch with it.
 *   - the column that is off screen is hidden with `visibility`, transitioned
 *     rather than set, so it stays visible for the length of the slide out and
 *     a Tab cannot walk into a list nobody can see.
 *
 * The sheet is position:fixed and resolves against the viewport only because
 * no ancestor sets transform or filter - the header's backdropFilter is on the
 * inner bar, which is a sibling. Moving it up would silently break this.
 *
 * WHAT IT LISTS IS NOT DECIDED HERE. The site rows are siteNav.SITE_NAV and
 * the account rows are accountNav.ACCOUNT_MENU - the same two lists the
 * desktop bar, its panel, the account dropdown and the account sidebar draw -
 * so this file only decides how a row LOOKS on a phone. The desktop was told
 * to follow this menu; the way it does that is by reading the same list,
 * and tests/menuParity.test.js mounts both and compares what they draw.
 *
 * NOTHING HERE IS FETCHED; see the note on SITE_NAV in siteNav.js.
 */
/** The sheet's id, for the hamburger's aria-controls. */
export const MOBILE_NAV_ID = 'site-mobile-nav';

export default function MobileNav({ isOpen, onClose }) {
  const { t, locale, setLocale } = useI18n();

  const surface = useSurface();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const { colorMode, toggleColorMode } = useColorMode();

  const isSignedIn = useSelector(selectIsSignedIn);
  const user = useSelector(selectUser);
  const signIn = useSignIn();

  /* Which root list is showing, and which branch of it is open. */
  const [mode, setMode] = useState('main');
  const [panel, setPanel] = useState(null);

  /*
   * The panel sliding OUT still has to be drawn. `panel` goes null the instant
   * Back is tapped, and the column would empty itself a frame before it has
   * moved anywhere - so the last one is kept until something replaces it.
   */
  const shown = useRef(null);
  if (panel) shown.current = panel;

  const inAccount = location.pathname.indexOf('/account') === 0;

  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  /*
   * OPENING PICKS THE ROOT FROM THE ROUTE.
   *
   * Set on the way OPEN rather than on every render, so switching roots by
   * hand inside the sheet is not undone a frame later by this effect.
   */
  useEffect(() => {
    if (!isOpen) return;
    setMode(isSignedIn && inAccount ? 'account' : 'main');
    setPanel(null);
  }, [isOpen, isSignedIn, inAccount]);

  /* A closed sheet forgets its branch - after the close, so it does not jump. */
  useEffect(() => {
    if (isOpen) return undefined;
    const timer = setTimeout(() => setPanel(null), 260);
    return () => clearTimeout(timer);
  }, [isOpen]);

  /**
   * One tappable row. The only difference between them is what is on the right
   * - and what it IS underneath: a row that goes to a page is a LINK (`to`),
   * one that goes to a Crystal store is an external link (`href`) - followed
   * in place, with no icon, because the shops are Crystal to the people in
   * them - and one that opens
   * a branch or switches the list is a button (`onClick`). They were all
   * buttons that pushed history, which a screen reader announced as buttons
   * and a long-press could not open in a new tab.
   */
  const row = (props) => {
    const { key, label, onClick, href, to, after, weight, size } = props;

    const inner = (
      <>
        <Text
          flex="1"
          textAlign="left"
          fontWeight={weight || '600'}
          fontSize={size || 'md'}
          color={surface.text}
        >
          {label}
        </Text>
        {after}
      </>
    );

    const shared = {
      display: 'flex',
      alignItems: 'center',
      w: '100%',
      px: '5',
      py: '4',
      _hover: { textDecoration: 'none', bg: surface.hover },
      _active: { bg: surface.hover }
    };

    if (href) return <Link key={key} href={href} {...shared}>{inner}</Link>;
    if (to) return <Box key={key} as={RouterLink} to={to} onClick={onClose} {...shared}>{inner}</Box>;
    return <Box key={key} as="button" type="button" onClick={onClick} {...shared}>{inner}</Box>;
  };

  const chevron = <Icon as={FiChevronRight} boxSize="4" color={surface.muted} />;

  /* The branch being shown, from whichever root it belongs to. */
  const siteBranch = mode === 'main'
    ? PHONE_BRANCHES.filter((entry) => entry.key === shown.current)[0] || null
    : null;
  const accountBranch = mode === 'account'
    ? ACCOUNT_MENU.filter((entry) => entry.links && entry.key === shown.current)[0] || null
    : null;

  const displayName = accountName(user, t);

  const siteRoot = (
    <Stack spacing="0" divider={<Divider borderColor={surface.border} />}>
      {/*
        * WHO IS LOOKING, first row. Signed in it opens the account menu - the
        * same list the sidebar shows - and signed out it is the way to getting
        * one.
        */}
      {isSignedIn
        ? row({
          key: 'account',
          label: displayName,
          onClick: () => setMode('account'),
          after: chevron
        })
        : row({
          key: 'signin',
          label: t('layout.signInSignUp'),
          onClick: () => {
            onClose();
            signIn();
          },
          after: <Icon as={FiUser} boxSize="4" color={surface.muted} />
        })}

      {/*
        * A branch opens; a page goes there; a STORE leaves, with no icon -
        * the Eshop and the Appstore are Crystal to the member, and the
        * desktop bar draws them the same way. See siteNav.js.
        */}
      {SITE_PHONE.map((entry) => {
        if (entry.links) {
          return row({ key: entry.key, label: t(entry.label), onClick: () => setPanel(entry.key), after: chevron });
        }
        return entry.external
          ? row({ key: entry.key, label: t(entry.label), href: entry.href })
          : row({ key: entry.key, label: t(entry.label), to: entry.to });
      })}
    </Stack>
  );

  const accountRoot = (
    <Stack spacing="0" divider={<Divider borderColor={surface.border} />}>
      {/*
        * The way back to the site, in the same position the account row holds
        * on the other root - so the switch is in one place whichever direction
        * you are going.
        */}
      {row({
        key: 'site',
        label: t('layout.mainMenu'),
        onClick: () => setMode('main'),
        after: <Icon as={FiGrid} boxSize="4" color={surface.muted} />
      })}

      <Box px="5" pt="4" pb="1">
        <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.06em">
          {t('layout.signedInAs')}
        </Text>
        <Text fontWeight="700" color={surface.text}>{displayName}</Text>
      </Box>

      {/*
        * ONE ROW PER GROUP, drilling down - the same shape as the site menu.
        * A group holding a single entry goes straight there rather than into a
        * panel with one row in it; ACCOUNT_MENU is where that is decided, for
        * this sheet, the header dropdown and the sidebar alike.
        */}
      {ACCOUNT_MENU.map((entry) => {
        if (entry.links) {
          return row({ key: entry.key, label: t(entry.label), onClick: () => setPanel(entry.key), after: chevron });
        }
        return entry.external
          ? row({ key: entry.key, label: t(entry.label), href: entry.href })
          : row({ key: entry.key, label: t(entry.label), to: entry.href });
      })}

      <Box px="5" py="5">
        <Button
          w="100%"
          variant="quiet"
          leftIcon={<Icon as={FiLogOut} />}
          onClick={() => {
            dispatch(signOut());
            onClose();
            history.push('/');
          }}
        >
          {t('common.signOut')}
        </Button>
      </Box>
    </Stack>
  );

  return (
    <Box
      id={MOBILE_NAV_ID}
      display={{ base: 'block', lg: 'none' }}
      position="fixed"
      left="0"
      right="0"
      top={HEADER_BAR_HEIGHT}
      bottom="0"
      overflow="hidden"
      pointerEvents={isOpen ? 'auto' : 'none'}
      zIndex="1100"
      aria-hidden={!isOpen}
    >
      <Box
        h="100%"
        bg={surface.page}
        transform={isOpen ? 'translateY(0)' : 'translateY(-100%)'}
        transition="transform 260ms cubic-bezier(0.22, 1, 0.36, 1)"
      >
        <Flex
          h="100%"
          w="200%"
          transform={panel ? 'translateX(-50%)' : 'translateX(0)'}
          transition="transform 260ms cubic-bezier(0.22, 1, 0.36, 1)"
        >
          {/* ---- level one: the site menu, or the account menu ---- */}
          <Box
            data-level="root"
            w="50%"
            flexShrink="0"
            h="100%"
            overflowY="auto"
            pb="6"
            visibility={panel ? 'hidden' : 'visible'}
            transition="visibility 260ms"
            aria-hidden={!!panel}
          >
            {mode === 'account' ? accountRoot : siteRoot}

            {/*
              * The two utilities that left the header bar on small screens.
              *
              * EVERY LANGUAGE IS A BUTTON, the current one outlined. This was
              * one button that swapped English and Chinese, so a phone could
              * never reach Russian at all - and a phone is where
              * most of this site is read.
              */}
            <Divider borderColor={surface.border} />
            <Flex px="5" pt="4" align="center" wrap="wrap">
              <Icon as={FiGlobe} boxSize="4" color={surface.muted} mr="2" mb="2" aria-hidden />
              {LOCALES.map((entry) => (
                <Button
                  key={entry.code}
                  size="sm"
                  variant={entry.code === locale ? 'outlineBrand' : 'quiet'}
                  mr="2"
                  mb="2"
                  aria-pressed={entry.code === locale}
                  onClick={() => setLocale(entry.code)}
                >
                  {entry.label}
                </Button>
              ))}
            </Flex>
            <Flex px="5" pt="2" pb="4" gap="3" data-gap="12" data-gap-wrap wrap="wrap">
              <Button
                size="sm"
                variant="quiet"
                leftIcon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
                onClick={toggleColorMode}
              >
                {colorMode === 'light' ? t('layout.darkMode') : t('layout.lightMode')}
              </Button>
            </Flex>
          </Box>

          {/* ---- level two: one branch of whichever root is showing ---- */}
          <Box
            data-level="branch"
            w="50%"
            flexShrink="0"
            h="100%"
            overflowY="auto"
            pb="10"
            visibility={panel ? 'visible' : 'hidden'}
            transition="visibility 260ms"
            aria-hidden={!panel}
          >
            {/*
              * BACK IS A ROW, not a corner button. It is the width of the
              * panel and it names the branch, so it is hit with the same thumb
              * that opened it instead of being aimed at.
              */}
            <Flex
              as="button"
              type="button"
              onClick={() => setPanel(null)}
              w="100%"
              align="center"
              gap="2"
              data-gap="8"
              px="5"
              py="4"
              borderBottomWidth="1px"
              borderColor={surface.border}
              _hover={{ bg: surface.hover }}
            >
              <Icon as={FiChevronLeft} boxSize="5" color={surface.muted} />
              <Text fontWeight="700" color={surface.text}>
                {siteBranch ? t(siteBranch.label) : accountBranch ? t(accountBranch.label) : ''}
              </Text>
            </Flex>

            <Stack spacing="0" divider={<Divider borderColor={surface.border} />}>
              {siteBranch && branchLinks(siteBranch).map((link) => (
                link.external
                  ? row({ key: link.label, label: t(link.label), href: link.href, weight: '500' })
                  : row({ key: link.to, label: t(link.label), to: link.to, weight: '500' })
              ))}

              {accountBranch && accountBranch.links.map((item) => (
                item.external
                  ? row({ key: item.label, label: t(item.label), href: item.href, weight: '500' })
                  : row({ key: item.label, label: t(item.label), to: hrefOf(item), weight: '500' })
              ))}
            </Stack>
          </Box>
        </Flex>
      </Box>
    </Box>
  );
}
