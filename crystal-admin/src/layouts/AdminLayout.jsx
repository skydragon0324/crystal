import React, { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Box, Drawer, DrawerContent, DrawerOverlay, Flex, IconButton, Tooltip, useDisclosure
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';

import Sidebar from './Sidebar';
import { useAppearance } from '../app/appearance';
import Navbar from './Navbar';
import IdleTimer from '../components/IdleTimer';
import { useT } from '../i18n';
import { useSurface, useSidebar } from '../theme/tokens';

/** Remembered across reloads: a collapsed menu is a working preference. */
const COLLAPSE_KEY = 'crystal.admin.sidebarCollapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch (e) {
    return false;   // storage disabled - the menu simply always starts open
  }
}

/**
 * Sidebar, header, content - the layout the spec asks for.
 *
 * The page title comes from the same rows the menu is built from, so a screen
 * never has to state its own name twice and a renamed page is renamed
 * everywhere at once.
 *
 * The sidebar collapses to icons on a wide screen and becomes a drawer on a
 * narrow one: those are two different problems.  Collapsing is somebody
 * reclaiming 180px for a wide table and expecting the menu to stay reachable;
 * the drawer is a screen with no room for a menu at all.
 */
export default function AdminLayout({ children }) {
  const t = useT();
  const location = useLocation();
  const pages = useSelector((state) => state.auth.pages);
  const drawer = useDisclosure();
  const surface = useSurface();
  const menuColors = useSidebar();
  const { width } = useAppearance();

  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapse = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch (e) { /* ignore */ }
      return next;
    });
  }, []);

  const current = pages.find((page) => page.page_url === location.pathname)
    || pages.find((page) => location.pathname.indexOf(page.page_url + '/') === 0);

  return (
    <Flex h="100vh" overflow="hidden" bg={surface.page}>
      {/*
        * The menu and the handle that moves it.
        *
        * The button is centred ON the border rather than tucked inside either
        * side of it: it is the seam itself that it drags, and half of it
        * overhanging each way is what makes that read at a glance.  The
        * chevron points the way the edge will go - left to close it, right to
        * open it again - which is the one thing the icon has to say.
        */}
      <Box display={{ base: 'none', lg: 'block' }} flexShrink={0} position="relative">
        <Sidebar collapsed={collapsed} />

        <Tooltip
          label={t(collapsed ? 'Expand menu' : 'Collapse menu')}
          placement="right"
          openDelay={400}
        >
          <IconButton
            aria-label={t(collapsed ? 'Expand menu' : 'Collapse menu')}
            icon={collapsed
              ? <ChevronRightIcon w="0.875rem" h="0.875rem" />
              : <ChevronLeftIcon w="0.875rem" h="0.875rem" />}
            size="xs"
            position="absolute"
            top="4.375rem"
            right="-0.6875rem"
            zIndex={20}
            minW="1.375rem"
            w="1.375rem"
            h="1.375rem"
            borderRadius="full"
            bg={surface.card}
            color={menuColors.muted}
            border="1px solid"
            borderColor={menuColors.border}
            boxShadow="sm"
            _hover={{ bg: surface.hover, color: 'brand.500', borderColor: 'brand.500' }}
            _active={{ bg: surface.hover }}
            onClick={toggleCollapse}
          />
        </Tooltip>
      </Box>

      <Drawer isOpen={drawer.isOpen} placement="left" onClose={drawer.onClose}>
        <DrawerOverlay />
        <DrawerContent maxW="15.5rem">
          <Sidebar onNavigate={drawer.onClose} />
        </DrawerContent>
      </Drawer>

      <Flex direction="column" flex="1" overflow="hidden" minW="0">
        <Navbar
          onOpenSidebar={drawer.onOpen}
          title={t(current ? current.page_name : 'Crystal')}
        />
        {/*
          * THE SCROLLER IS THE OUTER BOX, THE MEASURE IS THE INNER ONE.
          *
          * `static` stops the content at a readable width and centres it,
          * which is what keeps a table of eight columns from stretching to
          * two thousand pixels on a wide monitor and putting the first and
          * last cell of a row too far apart to read as one row.
          *
          * The cap is a Chakra container token, so it is in rem and moves
          * with the screen scale rather than staying put while everything
          * around it shrinks. `full` is the escape hatch for somebody who
          * wants every column they can get.
          */}
        <Box flex="1" overflowY="auto">
          <Box
            maxW={width === 'static' ? 'container.xl' : 'none'}
            mx="auto"
            w="100%"
            p={{ base: 4, md: 5 }}
          >
            {children}
          </Box>
        </Box>
      </Flex>

      {/*
        * Mounted with the layout rather than with the app, so the clock only
        * runs while somebody is actually inside the console - the sign-in
        * screen has no session to time out.
        */}
      <IdleTimer />
    </Flex>
  );
}
