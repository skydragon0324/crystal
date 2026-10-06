import React, { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Box,
  Flex,
  Image,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import SiteContainer from 'components/Layout/SiteContainer';
import ColorModeToggle from 'components/ColorMode/ColorModeToggle';
import LanguageSelect from 'components/Lang/LanguageSelect';
import ClientNavLinks from './ClientNavLinks';
import ClientDrawer from 'layouts/sidebar/ClientDrawer';
import { buildHeaderNav, HEADER_HEIGHT, SITE_MAX_WIDTH } from 'constants/siteNav';
import { PAGE_HOME_URL } from 'constants/constants';
import { getLangText } from 'lang/lang';
import useLang from 'lang/useLang';

import icLogoDark from 'assets/images/logo_dark.png';
import icLogoWhite from 'assets/images/logo_white.png';

/**
 * Site header, following the mi.com/global pattern:
 *
 *   - a thin announcement strip above the bar
 *   - a fixed-height white bar, sticky, with a hairline bottom border
 *   - logo left, primary navigation centred, account controls right
 *   - hovering a category drops a full-width panel spanning the whole
 *     viewport while its contents stay inside the centred column
 *
 * The previous header was absolutely positioned inside a <Portal> and sized
 * with `calc(100vw - 75px)`, so it sat outside document flow, overlapped
 * the page it was supposed to sit above, and mis-measured whenever a
 * scrollbar appeared. This is an ordinary sticky element in normal flow.
 */
const ClientHeader = () => {
  const { pathname } = useLocation();
  const { locale } = useLang();
  const [openKey, setOpenKey] = useState(null);

  const bg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('gray.700', 'gray.100');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const stripBg = useColorModeValue('gray.50', 'navy.900');
  const panelBg = useColorModeValue('white', 'navy.800');
  const panelHoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const activeColor = 'brand.600';
  const icLogo = useColorModeValue(icLogoDark, icLogoWhite);

  // Shaped once per language. The menu labels are translated, so an empty
  // dependency list would leave the bar in the language the app booted in
  // after a switch.
  const nav = useMemo(() => buildHeaderNav(), [locale]);

  const isActive = (path) => !!path && pathname.startsWith(path);

  const openItem = nav.find((item) => item.path === openKey);

  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex={1200}
      bg={bg}
      borderBottomWidth="1px"
      borderColor={borderColor}
      // Contains the dropdown panel, which is positioned against this box
      // so it can span the full viewport width regardless of the container.
      onMouseLeave={() => setOpenKey(null)}
    >
      {/* ---- announcement strip: mi.com runs one above the bar ---- */}
      <Box bg={stripBg} borderBottomWidth="1px" borderColor={borderColor} display={{ base: 'none', md: 'block' }}>
        <SiteContainer>
          <Flex h="32px" align="center" justify="space-between">
            <Text fontSize="12px" color={mutedColor} noOfLines={1}>
              {getLangText('HEADER_ANNOUNCE')}
            </Text>
            <Flex align="center" gridGap="14px" fontSize="12px" color={mutedColor}>
              <NavLink to="/vendor/phone/faqs">
                <Text _hover={{ color: activeColor }}>{getLangText('HEADER_SUPPORT')}</Text>
              </NavLink>
              {/* Renders nothing while English is the only catalogue. */}
              <LanguageSelect />
            </Flex>
          </Flex>
        </SiteContainer>
      </Box>

      {/* ---- main bar ---- */}
      <SiteContainer>
        <Flex h={{ base: `${HEADER_HEIGHT.base}px`, md: `${HEADER_HEIGHT.md}px` }} align="center" justify="space-between">
          {/* Hamburger first on mobile so the logo can stay optically centred */}
          <Flex align="center" display={{ base: 'flex', xl: 'none' }} me="8px">
            <ClientDrawer iconColor={textColor} headerOffset={HEADER_HEIGHT.base} />
          </Flex>

          <NavLink to={PAGE_HOME_URL} aria-label={getLangText('COMPANY_NAME')}>
            <Image src={icLogo} alt={getLangText('COMPANY_NAME')} h={{ base: '22px', md: '26px' }} w="auto" />
          </NavLink>

          {/* ---- primary navigation ---- */}
          <Flex
            as="nav"
            align="center"
            flex="1"
            justify="center"
            display={{ base: 'none', xl: 'flex' }}
            h="100%"
          >
            {nav.map((item) => (
              <Box
                key={item.path}
                h="100%"
                onMouseEnter={() => setOpenKey(item.children.length ? item.path : null)}
              >
                <NavItem
                  item={item}
                  active={isActive(item.path)}
                  activeColor={activeColor}
                  textColor={textColor}
                />
              </Box>
            ))}
          </Flex>

          <ColorModeToggle ms={{ base: '4px', xl: '8px' }} />

          <ClientNavLinks />
        </Flex>
      </SiteContainer>

      {/* ---- dropdown panel ----
          Full-bleed background, centred contents. Rendered only for the
          hovered category so an empty panel never flashes. */}
      {openItem && openItem.children.length > 0 && (
        <Box
          position="absolute"
          left="0"
          right="0"
          top="100%"
          bg={panelBg}
          borderBottomWidth="1px"
          borderColor={borderColor}
          boxShadow="0 8px 16px rgba(22, 26, 31, 0.06)"
          display={{ base: 'none', xl: 'block' }}
          onMouseEnter={() => setOpenKey(openItem.path)}
        >
          <Box maxW={SITE_MAX_WIDTH} mx="auto" px="20px" py="20px">
            <Flex wrap="wrap">
              {openItem.children.map((child) => (
                <NavLink key={child.path} to={child.path} onClick={() => setOpenKey(null)}>
                  <Flex
                    direction="column"
                    justify="center"
                    minW="180px"
                    px="16px"
                    py="14px"
                    me="8px"
                    borderRadius="md"
                    _hover={{ bg: panelHoverBg }}
                  >
                    <Text
                      fontSize="15px"
                      fontWeight="500"
                      color={isActive(child.path) ? activeColor : textColor}
                    >
                      {child.name}
                    </Text>
                  </Flex>
                </NavLink>
              ))}
            </Flex>
          </Box>
        </Box>
      )}
    </Box>
  );
};

/**
 * One top-level entry. External destinations leave the SPA, so they have to
 * be plain anchors - a NavLink would push a route that does not exist.
 */
const NavItem = ({ item, active, activeColor, textColor }) => {
  const label = (
    <Flex align="center" h="100%" px="14px">
      <Text
        fontSize="15px"
        fontWeight="500"
        whiteSpace="nowrap"
        color={active ? activeColor : textColor}
        _hover={{ color: activeColor }}
        transition="color 0.15s ease"
      >
        {item.name}
      </Text>
    </Flex>
  );

  if (item.external) {
    return (
      <Box as="a" href={item.path} h="100%" display="flex" alignItems="center">
        {label}
      </Box>
    );
  }

  // A category is a hover target, not a destination: "/vendor/phone" has no
  // route of its own, so linking the label led to a blank page. mi.com
  // treats its categories the same way - the panel is the navigation.
  if (item.children && item.children.length > 0) {
    return (
      <Box h="100%" display="flex" alignItems="center" cursor="default">
        {label}
      </Box>
    );
  }

  return (
    <Box as={NavLink} to={item.path} h="100%" display="flex" alignItems="center">
      {label}
    </Box>
  );
};

export default ClientHeader;
