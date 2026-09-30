import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Box, Collapse, Flex, Icon, Text, Tooltip, VStack } from '@chakra-ui/react';
import * as Md from 'react-icons/md';
import { useSelector } from 'react-redux';
import AppName from '../components/AppName';
import { useT } from '../i18n';
import { useSidebar } from '../theme/tokens';
import { preloadRoute } from '../routes';

/** Width in each state, shared with the layout that reserves the space. */
export const SIDEBAR_WIDTH = '15.5rem';
export const SIDEBAR_COLLAPSED = '4.25rem';

/**
 * The menu, built from what the server said this role may open.
 *
 * Not from a constant in this repository - that is the whole point.  A role
 * that has been granted a screen sees it and a role that has not does not,
 * decided in one place (the permission grid) rather than in two that drift.
 * A menu that draws entries the user is refused on teaches people the app is
 * broken.
 *
 * Groups are the parent rows: `parent_id` is null on a heading and points at
 * it on a child.  A heading whose children were all filtered out is dropped
 * too, because an empty group is a menu item that does nothing.
 *
 * The palette FOLLOWS THE COLOUR MODE.  It used to be charcoal in both, on
 * the theory that navigation is furniture - but a black column down the side
 * of an otherwise white console reads as a panel that failed to load rather
 * than as a deliberate one.
 */
export default function Sidebar({ onNavigate, collapsed }) {
  const t = useT();
  const location = useLocation();
  const pages = useSelector((state) => state.auth.pages);
  const menuColors = useSidebar();

  const menu = pages.filter((page) => page.is_menu);
  const groups = menu.filter((page) => !page.parent_id);
  const orphans = menu.filter(
    (page) => page.parent_id && !groups.some((group) => group.page_id === page.parent_id)
  );

  const childrenOf = (group) => menu.filter((page) => page.parent_id === group.page_id);
  const activeGroup = groups.find((group) => childrenOf(group).some((page) => (
    location.pathname === page.page_url || location.pathname.indexOf(page.page_url + '/') === 0
  )));
  const activeGroupId = activeGroup ? activeGroup.page_id : null;
  const [expanded, setExpanded] = useState(activeGroupId);

  // Route navigation always reveals its parent, while still allowing the
  // reader to close or open any group manually between navigations.
  useEffect(() => {
    if (activeGroupId) setExpanded(activeGroupId);
  }, [location.pathname, activeGroupId]);

  const renderItem = (page) => {
    const active = location.pathname === page.page_url ||
      location.pathname.indexOf(page.page_url + '/') === 0;

    const label = t(page.page_name);

    const item = (
      <Flex
        key={page.page_id}
        as={NavLink}
        to={page.page_url}
        onClick={onNavigate}
        onMouseEnter={() => preloadRoute(page.page_url)}
        onFocus={() => preloadRoute(page.page_url)}
        align="center"
        gap={collapsed ? 0 : 3}
        // Collapsed there is only an icon, so there is nothing to space.
        data-gap={collapsed ? undefined : '12'}
        justify={collapsed ? 'center' : 'flex-start'}
        px={collapsed ? 0 : 3}
        py="0.4375rem"
        borderRadius="0.375rem"
        fontSize="sm"
        fontWeight={active ? 500 : 400}
        position="relative"
        color={active ? menuColors.text : menuColors.muted}
        bg={active ? menuColors.activeBg : 'transparent'}
        _hover={{ color: menuColors.text, bg: menuColors.hover, textDecoration: 'none' }}
        transition="color .12s ease, background .12s ease"
      >
        {/*
          * The active mark is a bar on the leading edge rather than a filled
          * pill: at this density a solid block per selected row makes the
          * whole column read as a set of buttons instead of a list.
          */}
        {active ? (
          <Box
            position="absolute" left="0" top="0.375rem" bottom="0.375rem"
            w="2px" borderRadius="2px" bg="brand.500"
            // Out of flow, so the Chrome 72 gap fallback must not put a
            // margin on it - that would push the marker off the edge it is
            // pinned to.  See styles/app.css.
            data-gap-skip=""
          />
        ) : null}

        <Icon
          as={Md[page.icon] || Md.MdChevronRight}
          w="1.0625rem" h="1.0625rem" flexShrink={0}
          color={active ? 'brand.500' : menuColors.muted}
        />
        {collapsed ? null : <Text noOfLines={1}>{label}</Text>}
      </Flex>
    );

    // Collapsed, the icon is all there is, so the name has to be reachable
    // some other way or the menu becomes a memory test.
    return collapsed
      ? <Tooltip key={page.page_id} label={label} placement="right" openDelay={200}>{item}</Tooltip>
      : item;
  };

  const renderGroup = (group) => {
    const children = childrenOf(group);
    if (!children.length) return null;

    return (
      <Box key={group.page_id} w="100%">
        {collapsed ? (
          <Box h="1px" bg={menuColors.border} mx="0.875rem" my="0.625rem" />
        ) : (
          <Flex
            as="button" type="button" w="100%" align="center" justify="space-between"
            px={3} pt="0.875rem" pb="0.375rem"
            fontSize="0.625rem" fontWeight="600" letterSpacing="0.06em"
            textTransform="uppercase" color={menuColors.muted} opacity={0.8}
            onClick={() => setExpanded(expanded === group.page_id ? null : group.page_id)}
            aria-expanded={expanded === group.page_id}
          >
            <Text>{t(group.page_name)}</Text>
            <Icon as={expanded === group.page_id ? Md.MdExpandLess : Md.MdExpandMore} boxSize="0.875rem" />
          </Flex>
        )}
        {collapsed ? (
          <VStack align="stretch" spacing="1px">{children.map(renderItem)}</VStack>
        ) : (
          <Collapse in={expanded === group.page_id} animateOpacity>
            <VStack align="stretch" spacing="1px">{children.map(renderItem)}</VStack>
          </Collapse>
        )}
      </Box>
    );
  };

  return (
    <Flex
      direction="column"
      w={collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH}
      h="100vh"
      bg={menuColors.bg}
      borderRight="1px solid"
      borderColor={menuColors.border}
      transition="width .16s ease"
      overflow="hidden"
    >
      <Flex
        align="center" justify={collapsed ? 'center' : 'flex-start'}
        h="3.5rem" px={collapsed ? 0 : 4} flexShrink={0}
        borderBottom="1px solid" borderColor={menuColors.border}
      >
        <Flex
          align="center" justify="center"
          w="1.625rem" h="1.625rem" borderRadius="0.375rem" bg="brand.500"
          fontSize="0.6875rem" fontWeight="700" color="white" flexShrink={0}
        >
          <AppName short />
        </Flex>
        {collapsed ? null : (
          <Text ms="0.625rem" fontSize="sm" fontWeight="700" letterSpacing="0.02em" color={menuColors.text}>
            <AppName />
          </Text>
        )}
      </Flex>

      <Box flex="1" overflowY="auto" overflowX="hidden" px="0.625rem" pb="1rem">
        <VStack align="stretch" spacing="1px" pt="0.375rem">
          {orphans.map(renderItem)}
        </VStack>
        {groups.map(renderGroup)}
      </Box>
    </Flex>
  );
}
