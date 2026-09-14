import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Avatar,
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
import { FiChevronDown, FiExternalLink } from 'react-icons/fi';
import { useDispatch, useSelector } from 'react-redux';

import { ACCOUNT_NAV, findAccountPage, hrefOf } from './accountNav';
import { HEADER_HEIGHT } from '@/components/layout/siteNav';
import { refreshWallet, selectUser, selectWallet } from '@/app/authSlice';
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
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const wallet = useSelector(selectWallet);

  /*
   * The wallet is loaded HERE rather than at sign-in: it is the account area
   * that shows a balance, the sign-in reply does not carry one, and a member
   * who never opens this half of the site has no reason to have fetched it.
   */
  useEffect(() => {
    dispatch(refreshWallet());
  }, [dispatch]);

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
   * OPENING IS REMEMBERED, CLOSING IS NOT FOUGHT. The state holds only what
   * the member has touched; anything they have not is answered by "is this the
   * active section". That is what makes navigation do the right thing without
   * a second effect watching the route: following a link into another section
   * moves `activeSection`, and the new section is open because it is active,
   * not because something opened it. A member who opens Points to compare it
   * with Software keeps both, and one who shuts the active section gets to
   * keep it shut - a menu that springs back open is a menu arguing with you.
   */
  const [toggled, setToggled] = useState({});

  const isOpen = (section) => (
    Object.prototype.hasOwnProperty.call(toggled, section)
      ? toggled[section]
      : section === activeSection
  );

  const toggle = (section) => {
    /*
     * `open` is read BEFORE the updater runs. React 16 pools synthetic
     * events, and reading anything off one inside a functional updater is
     * reading it after the pool has taken it back.
     */
    const open = isOpen(section);
    setToggled((held) => ({ ...held, [section]: !open }));
  };

  return (
    <Container maxW="container.site" px={{ base: 4, md: 6 }} py={{ base: 6, md: 10 }}>
      <Grid templateColumns={{ base: '1fr', lg: '240px 1fr' }} gap={{ base: 6, lg: 12 }}>
        <Box display={{ base: 'none', lg: 'block' }}>
          <Box position="sticky" top={`calc(${HEADER_HEIGHT.md} + 24px)`}>
            <Flex
              align="center"
              gap="3" data-gap="12"
              p="4"
              borderRadius="14px"
              bg={surface.raised}
              mb="6"
            >
              <Avatar
                size="sm"
                name={user ? user.nickname : 'Crystal'}
                bg="brand.500"
                color="white"
              />
              <Box minW="0">
                <Text fontWeight="700" color={surface.text} isTruncated>
                  {user ? user.nickname : ''}
                </Text>
                <Text fontSize="xs" color={surface.muted}>
                  {wallet ? `${Number(wallet.point_balance || 0).toLocaleString()} points` : ''}
                </Text>
              </Box>
            </Flex>

            <Stack spacing="2">
              {ACCOUNT_NAV.map((group) => (
                <Box key={group.section}>
                  {/*
                    * A BUTTON, not a heading with a click handler. It is
                    * operated by keyboard and announced as expandable for
                    * free, and `aria-expanded` is the only thing that tells a
                    * screen reader the list below it came or went.
                    */}
                  <Flex
                    as="button"
                    type="button"
                    onClick={() => toggle(group.section)}
                    aria-expanded={isOpen(group.section)}
                    align="center"
                    justify="space-between"
                    w="100%"
                    py="1.5"
                    textAlign="left"
                    _hover={{ color: 'brand.500' }}
                    color={group.section === activeSection ? surface.text : surface.muted}
                  >
                    <Text
                      fontSize="10px"
                      fontWeight="700"
                      letterSpacing="1px"
                      textTransform="uppercase"
                    >
                      {t(group.section)}
                    </Text>
                    <Icon
                      as={FiChevronDown}
                      boxSize="3"
                      /*
                       * Rotated rather than swapped for a second icon, so the
                       * arrow turns instead of jumping. `transform` and
                       * `transition` are Chrome 72 safe.
                       */
                      transform={isOpen(group.section) ? 'rotate(0deg)' : 'rotate(-90deg)'}
                      transition="transform 150ms ease"
                    />
                  </Flex>
                  <Collapse in={isOpen(group.section)} animateOpacity>
                  <Stack spacing="0" pb="2">
                    {group.items.map((item) =>
                      item.external ? (
                        <Link
                          key={t(item.label)}
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
                      ) : (
                        <Link
                          key={item.label}
                          as={RouterLink}
                          to={hrefOf(item)}
                          py="1.5"
                          fontSize="sm"
                          fontWeight={active && active.label === item.label ? 700 : 400}
                          color={active && active.label === item.label ? 'brand.500' : surface.muted}
                          _hover={{ color: 'brand.500', textDecoration: 'none' }}
                        >
                          {t(item.label)}
                        </Link>
                      )
                    )}
                  </Stack>
                  </Collapse>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>

        <Box minW="0">
          {active && (
            <Box mb="6">
              <Text fontSize="xs" color={surface.muted} textTransform="uppercase" letterSpacing="0.6px">
                {active.section}
              </Text>
              <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
                {active.label}
              </Heading>
            </Box>
          )}
          {children}
        </Box>
      </Grid>
    </Container>
  );
}
