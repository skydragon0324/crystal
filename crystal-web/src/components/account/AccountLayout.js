import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Box,
  Collapse,
  Container,
  Flex,
  Grid,
  Heading,
  Icon,
  Link,
  Stack,
  Text
} from '@chakra-ui/react';
import { FiChevronDown, FiExternalLink, FiUser } from 'react-icons/fi';
import { useSelector } from 'react-redux';

import { ACCOUNT_MENU, findAccountPage, hrefOf } from './accountNav';
import { HEADER_HEIGHT } from '@/components/layout/siteNav';
import { selectUser } from '@/app/authSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * The member centre's own chrome, INSIDE the site Layout.
 *
 * It adds a sidebar; it does not replace the site header and footer. When the
 * account routes sat outside Layout the whole signed-in half of the site had
 * no primary menu, no search and, on a phone, no way back to the storefront.
 *
 * The sidebar sticks below the site header, using siteNav.HEADER_HEIGHT
 * rather than a literal - it cannot measure the header, so the number lives
 * in one place.
 *
 * Below `lg` the sidebar is not rendered at all: the site's mobile sheet
 * already carries the whole account menu, and a second copy stacked above
 * every page would push the content itself off the first screen.
 */
export default function AccountLayout({ children }) {
  const t = useT();
  const surface = useSurface();
  const location = useLocation();
  const user = useSelector(selectUser);

  /*
   * THE TWO LINES OF THE HEADER, and what happens when the first one is
   * missing.
   *
   * `login` is the platform user ID. The sign-in reply does not carry it yet -
   * it is requested from the API alongside this change - so the id line falls
   * back to the NAME rather than rendering an empty row above a name: a blank
   * bold line reads as something that failed to load, and the panel is the
   * first thing on the page. When the id is there, both lines are.
   */
  const name = user ? (user.nickname || '') : '';
  const login = user ? (user.login || '') : '';

  /*
   * The search string matters here: four entries share /account/points and are
   * told apart only by the filter they preset - see findAccountPage.
   */
  const active = findAccountPage(location.pathname, location.search);
  const activeSection = active ? active.section : null;

  /*
   * ONE SECTION IS OPEN: the one the member is reading.
   *
   * Ten sections holding thirty-odd entries were all expanded at once, which
   * is a sidebar taller than the window on every screen. The member scrolls a
   * menu to reach a page, and the page they are ON is somewhere in that
   * scroll - so the one piece of information the menu is best placed to give,
   * "you are here", is the piece most likely to be off-screen.
   *
   * AN ACCORDION: ONE CATEGORY OPEN AT A TIME, and choosing a page closes the
   * rest. This used to remember every category the member had opened, so after
   * a few visits the sidebar was as tall as it was before any of this - three
   * or four categories hanging open that the member had only glanced into. Now
   * `open` is a single category:
   *
   *   following a link into a page     the page's category, and only it
   *   clicking a closed category        that one, and the others close
   *   clicking the open one             closes it; nothing is open
   *
   * The route is the stronger signal. Whatever was opened by hand, arriving on
   * a page resets the sidebar to where that page is - which is the moment the
   * member most needs to see it.
   */
  const [open, setOpen] = useState(activeSection);

  useEffect(() => {
    setOpen(activeSection);
  }, [activeSection, location.pathname, location.search]);

  const isOpen = (section) => section === open;

  const toggle = (section) => {
    setOpen((current) => (current === section ? null : section));
  };

  /**
   * One page's link - inside an open group, or on its own for a group of one.
   *
   * THE ICON IS DESKTOP ONLY, and this is the only place it is drawn. This
   * whole column is inside a `display={{ base: 'none', lg: 'block' }}` box, so
   * "desktop only" costs nothing here - the phone sheet builds its rows from
   * `label` and `to` and never reads `icon`. That is deliberate: the sheet's
   * main branch has no icons, and a menu that is decorated on one branch and
   * bare on the other reads as two menus.
   *
   * Fixed 16px of gutter whether or not the entry has an icon, so the words
   * line up down the column - a row that starts further left than the one
   * above it is how a list stops looking like a list.
   */
  const pageLink = (item, section) => {
    if (item.external) {
      return (
        <Link
          key={item.label}
          href={item.href}
          isExternal
          display="flex"
          alignItems="center"
          gap="1.5" data-gap="6"
          py="1.5"
          fontSize="sm"
          color={surface.muted}
          _hover={{ color: 'brand.500', textDecoration: 'none' }}
        >
          {t(item.label)}
          <Icon as={FiExternalLink} boxSize="3" />
        </Link>
      );
    }

    const here = !!active && active.label === item.label && active.section === section;

    return (
      <Link
        key={item.label}
        as={RouterLink}
        to={hrefOf(item)}
        aria-current={here ? 'page' : undefined}
        display="flex"
        alignItems="center"
        gap="2" data-gap="8"
        py="1.5"
        fontSize="sm"
        fontWeight={here ? 700 : 400}
        color={here ? 'brand.500' : surface.muted}
        _hover={{ color: 'brand.500', textDecoration: 'none' }}
      >
        <Box w="16px" flexShrink={0} lineHeight="0">
          {item.icon && <Icon as={item.icon} boxSize="4" aria-hidden="true" />}
        </Box>
        <Box as="span" minW="0" isTruncated>
          {t(item.label)}
        </Box>
      </Link>
    );
  };

  return (
    <Container maxW="container.site" px={{ base: 4, md: 6 }} py={{ base: 6, md: 10 }}>
      <Grid templateColumns={{ base: '1fr', lg: '240px 1fr' }} gap={{ base: 6, lg: 12 }}>
        <Box display={{ base: 'none', lg: 'block' }}>
          <Box position="sticky" top={`calc(${HEADER_HEIGHT.md} + 24px)`}>
            {/*
              * WHO YOU ARE SIGNED IN AS - the icon, the USER ID, the name.
              *
              * This used to be an avatar, the nickname and a POINTS BALANCE,
              * and the balance was the wrong thing in the one place it could
              * not be checked. There are six point systems and they do not add
              * up - karaoke points cannot buy an app - so a single figure in
              * the chrome of every account page was a number the member could
              * not spend and could not reconcile against any of the six cards
              * on the points page. It also meant this component fetched the
              * wallet on arrival at every account route, for one line of text.
              *
              * The USER ID is what replaces it, and it is the more useful fact:
              * it is what the member typed to get in, it is what the eshop, the
              * appstore and the eproduct site key them by, and it is the first
              * thing support asks for. The nickname alone cannot answer "which
              * account am I in?" - two people can share one.
              *
              * The icon is a plain user glyph rather than an Avatar. Avatar
              * derives initials from the name, which for a Chinese or Russian
              * nickname is a single character in a coloured circle that looks
              * like a status dot; and the profile carries no picture, so the
              * initials were all it ever drew.
              */}
            <Flex
              align="center"
              gap="3" data-gap="12"
              p="4"
              borderRadius="14px"
              bg={surface.raised}
              mb="6"
            >
              <Flex
                align="center"
                justify="center"
                boxSize="32px"
                borderRadius="full"
                bg="brand.500"
                color="white"
                flexShrink={0}
              >
                <Icon as={FiUser} boxSize="4" aria-hidden="true" />
              </Flex>
              <Box minW="0">
                {/*
                  * THE ID FIRST, in mono, because it is an identifier and not
                  * prose: it is read character by character when somebody is
                  * reciting it down a phone, and a proportional font makes
                  * l/1 and O/0 a guess.
                  */}
                <Text
                  fontWeight="700"
                  fontFamily="mono"
                  fontSize="sm"
                  color={surface.text}
                  isTruncated
                >
                  {login || name}
                </Text>
                <Text fontSize="xs" color={surface.muted} isTruncated>
                  {login ? name : ''}
                </Text>
              </Box>
            </Flex>

            {/*
              * THE PHONE'S ROWS, in the phone's order, with the phone's words -
              * ACCOUNT_MENU, which the sheet and the header dropdown draw too.
              *
              * A GROUP OF ONE IS A LINK, not a heading to open. "Dashboard"
              * used to sit alone inside a collapsed section called Overview,
              * and "My Articles" inside one called Blog: two clicks for one
              * page, under a name the phone never used for it. They are rows
              * of their own now, exactly where the phone has them, and only a
              * group with something to choose between opens.
              */}
            <Stack as="nav" aria-label={t('layout.myAccount')} spacing="2">
              {ACCOUNT_MENU.map((entry) => (entry.links ? (
                <Box key={entry.key}>
                  {/*
                    * A BUTTON, not a heading with a click handler. It is
                    * operated by keyboard and announced as expandable for
                    * free, and `aria-expanded` is the only thing that tells a
                    * screen reader the list below it came or went.
                    */}
                  <Flex
                    as="button"
                    type="button"
                    onClick={() => toggle(entry.section)}
                    aria-expanded={isOpen(entry.section)}
                    align="center"
                    justify="space-between"
                    w="100%"
                    py="1.5"
                    textAlign="left"
                    _hover={{ color: 'brand.500' }}
                    color={entry.section === activeSection ? surface.text : surface.muted}
                  >
                    <Text
                      fontSize="10px"
                      fontWeight="700"
                      letterSpacing="1px"
                      textTransform="uppercase"
                    >
                      {t(entry.label)}
                    </Text>
                    <Icon
                      as={FiChevronDown}
                      boxSize="3"
                      /*
                       * Rotated rather than swapped for a second icon, so the
                       * arrow turns instead of jumping. `transform` and
                       * `transition` are Chrome 72 safe.
                       */
                      transform={isOpen(entry.section) ? 'rotate(0deg)' : 'rotate(-90deg)'}
                      transition="transform 150ms ease"
                    />
                  </Flex>
                  <Collapse in={isOpen(entry.section)} animateOpacity>
                  <Stack spacing="0" pb="2">
                    {entry.links.map((item) => pageLink(item, entry.section))}
                  </Stack>
                  </Collapse>
                </Box>
              ) : (
                <Box key={entry.key}>{pageLink(entry.item, entry.section)}</Box>
              )))}
            </Stack>
          </Box>
        </Box>

        <Box minW="0">
          {active && (
            <Box mb="6">
              <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.6px">
                {t(active.section)}
              </Text>
              <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
                {t(active.label)}
              </Heading>
            </Box>
          )}
          {children}
        </Box>
      </Grid>
    </Container>
  );
}
