import React, { useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Collapse,
  Divider,
  Flex,
  Icon,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiChevronDown, FiLogOut, FiUser } from 'react-icons/fi';
import { logout } from 'store/slices/clientSlice';
import { getClientMenus } from 'constants/clientMenus';
import { getAccountMenus } from 'constants/accountMenus';
import { getLangText } from 'lang/lang';
import useLang from 'lang/useLang';
import { PAGE_HOME_URL } from 'constants/constants';

/**
 * Mobile navigation, styled after the mi.com/global menu:
 * one full-width column, every entry stacked top-to-bottom, and a
 * category expanding in place rather than sliding to a second panel.
 *
 * The client and account menus are read from the same constants module
 * the desktop header and sidebar use, so the mobile menu can never drift
 * out of sync with the desktop one.
 */
const ClientMobileMenu = ({ onClose }) => {
  const { pathname } = useLocation();
  const history = useHistory();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.client.user);

  const [openKeys, setOpenKeys] = useState([]);
  const { locale } = useLang();

  // Rebuilt when the language moves, and at no other time.
  const clientMenus = useMemo(getClientMenus, [locale]);
  const accountMenus = useMemo(getAccountMenus, [locale]);

  const rowBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const subBg = useColorModeValue('gray.50', 'whiteAlpha.50');
  const titleColor = useColorModeValue('gray.800', 'white');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const labelColor = useColorModeValue('gray.500', 'gray.500');
  const activeColor = 'brand.600';

  // Open whichever category contains the current route, so the menu
  // reflects where the user actually is when it opens.
  useEffect(() => {
    const match = [...clientMenus, ...accountMenus]
      .map((group) => group.category?.path)
      .filter(Boolean)
      .find((path) => pathname.startsWith(path));
    if (match) {
      setOpenKeys((keys) => (keys.includes(match) ? keys : [...keys, match]));
    }
  }, [pathname, clientMenus, accountMenus]);

  const toggle = (key) => {
    setOpenKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
    );
  };

  // Every navigation has to close the drawer. Without this the panel
  // stays open on top of the page the user just navigated to.
  const go = (path, external) => {
    if (external) {
      window.location.href = path;
      return;
    }
    history.push(path);
    onClose && onClose();
  };

  const handleLogout = () => {
    dispatch(logout());
    onClose && onClose();
    history.push(PAGE_HOME_URL);
  };

  const handleLogin = () => {
    onClose && onClose();
    history.push('/vendor/auth/reganam');
  };

  const isActive = (path) => pathname === path || pathname.startsWith(`${path}/`);

  const renderGroup = (group, idx, keyPrefix) => {
    // A group without a category is a single top-level link.
    if (!group.category) {
      return group.menus.map((menu) => (
        <Row
          key={`${keyPrefix}-${menu.path}`}
          borderColor={rowBorder}
          onClick={() => go(menu.path, menu.external)}
        >
          <Text
            fontSize="16px"
            fontWeight="500"
            color={isActive(menu.path) ? activeColor : titleColor}
          >
            {menu.name}
          </Text>
        </Row>
      ));
    }

    const key = group.category.path;
    const open = openKeys.includes(key);
    const groupActive = pathname.startsWith(key);

    return (
      <Box key={`${keyPrefix}-${key}`}>
        <Row borderColor={rowBorder} onClick={() => toggle(key)}>
          <Text
            fontSize="16px"
            fontWeight="500"
            color={groupActive ? activeColor : titleColor}
          >
            {group.category.name}
          </Text>
          <Icon
            as={FiChevronDown}
            boxSize="18px"
            color={groupActive ? activeColor : subColor}
            transform={open ? 'rotate(180deg)' : 'rotate(0deg)'}
            transition="transform 0.2s ease"
          />
        </Row>

        <Collapse in={open} animateOpacity>
          <Box bg={subBg}>
            {group.menus.map((menu) => (
              <Flex
                key={menu.path}
                align="center"
                minH="48px"
                ps="32px"
                pe="20px"
                py="12px"
                cursor="pointer"
                borderBottomWidth="1px"
                borderColor={rowBorder}
                onClick={() => go(menu.path, menu.external)}
                _active={{ opacity: 0.6 }}
              >
                <Text
                  fontSize="15px"
                  color={isActive(menu.path) ? activeColor : subColor}
                >
                  {menu.name}
                </Text>
              </Flex>
            ))}
          </Box>
        </Collapse>
      </Box>
    );
  };

  return (
    <Box pb="40px">
      {/* ---- account strip, mirrors mi.com's login row ---- */}
      {user ? (
        <Flex align="center" justify="space-between" px="20px" py="16px">
          <Flex
            align="center"
            cursor="pointer"
            onClick={() => go('/vendor/account/eshop/orders')}
          >
            <Flex
              align="center"
              justify="center"
              boxSize="40px"
              borderRadius="full"
              bg={subBg}
              me="12px"
            >
              <Icon as={FiUser} boxSize="20px" color={subColor} />
            </Flex>
            <Box>
              <Text fontSize="15px" fontWeight="bold" color={titleColor}>
                {user.user_name}
              </Text>
              <Text fontSize="13px" color={subColor}>
                {user.user_id}
              </Text>
            </Box>
          </Flex>
          <Icon
            as={FiLogOut}
            boxSize="20px"
            color={subColor}
            cursor="pointer"
            onClick={handleLogout}
          />
        </Flex>
      ) : (
        <Flex align="center" px="20px" py="18px" cursor="pointer" onClick={handleLogin}>
          <Flex
            align="center"
            justify="center"
            boxSize="40px"
            borderRadius="full"
            bg={subBg}
            me="12px"
          >
            <Icon as={FiUser} boxSize="20px" color={subColor} />
          </Flex>
          <Text fontSize="16px" fontWeight="500" color={titleColor}>
            {getLangText('MENU_LOGIN')}
          </Text>
        </Flex>
      )}
      <Divider borderColor={rowBorder} />

      {/* ---- main navigation ---- */}
      {clientMenus.map((group, idx) => renderGroup(group, idx, 'client'))}

      {/* ---- account navigation, same constants as the desktop sidebar ---- */}
      {user && (
        <>
          <Text
            px="20px"
            pt="28px"
            pb="10px"
            fontSize="12px"
            fontWeight="bold"
            letterSpacing="0.08em"
            textTransform="uppercase"
            color={labelColor}
          >
            {getLangText('MENU_MYINFO')}
          </Text>
          {accountMenus.map((group, idx) => renderGroup(group, idx, 'account'))}
        </>
      )}
    </Box>
  );
};

/** One tappable row. 56px keeps it above the ~44px touch-target minimum. */
const Row = ({ children, borderColor, onClick }) => (
  <Flex
    align="center"
    justify="space-between"
    minH="56px"
    px="20px"
    py="14px"
    cursor="pointer"
    borderBottomWidth="1px"
    borderColor={borderColor}
    onClick={onClick}
    _active={{ opacity: 0.6 }}
  >
    {children}
  </Flex>
);

export default ClientMobileMenu;
