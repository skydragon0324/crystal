import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { NavLink, useHistory } from 'react-router-dom';
import {
  Avatar,
  Box,
  Divider,
  Flex,
  Icon,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiLogOut, FiUser } from 'react-icons/fi';
import { logout, x509Request, loginSuccess } from 'store/slices/clientSlice';
import { x509Login } from 'utils/X509Utils';
import useCustomToast from 'hooks/useCustomToast';
import { getLangText } from 'lang/lang';
import { PAGE_HOME_URL } from 'constants/constants';

/**
 * The account cluster at the right end of the header.
 *
 * Signed out this is a single "Sign in" link; signed in it is an avatar
 * that opens the account menu. The colour-mode and pin toggles that used to
 * sit here were both rendered with `display="none"` - dead controls
 * carrying live handlers - so they were dropped from this cluster; the
 * working colour-mode switch is a sibling in the header bar itself.
 * The header no longer takes a `scrolled` prop either: its background is
 * solid at every scroll position now, so there was nothing left to vary.
 */
const ClientNavLinks = () => {
  const user = useSelector((state) => state.client.user);
  const dispatch = useDispatch();
  const history = useHistory();
  const { toastError } = useCustomToast();

  const textColor = useColorModeValue('gray.700', 'gray.100');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const menuBg = useColorModeValue('white', 'navy.800');
  const menuBorder = useColorModeValue('gray.200', 'whiteAlpha.200');

  const handleLogin = async () => {
    // Production signs in against the smart-card reader; development has no
    // reader attached, so it falls back to the password form.
    if (process.env.NODE_ENV === 'production') {
      dispatch(x509Request());
      await x509Login(
        (data) => dispatch(loginSuccess(data)),
        (message) => toastError(message)
      );
      return;
    }
    history.push('/vendor/auth/reganam');
  };

  const handleLogout = () => {
    dispatch(logout());
    history.push(PAGE_HOME_URL);
  };

  if (!user) {
    return (
      <Flex align="center" ms={{ base: '8px', xl: '16px' }}>
        <Flex
          align="center"
          cursor="pointer"
          px={{ base: '8px', md: '12px' }}
          py="6px"
          borderRadius="md"
          onClick={handleLogin}
          _hover={{ color: 'brand.600' }}
        >
          <Icon as={FiUser} boxSize="18px" color={textColor} />
          <Text
            ms="8px"
            fontSize="14px"
            fontWeight="500"
            color={textColor}
            display={{ base: 'none', md: 'block' }}
            whiteSpace="nowrap"
          >
            {getLangText('HEADER_SIGN_IN')}
          </Text>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex align="center" ms={{ base: '8px', xl: '16px' }}>
      <Menu placement="bottom-end" autoSelect={false}>
        <MenuButton>
          <Flex align="center" px="6px" py="4px" borderRadius="md">
            <Avatar
              size="sm"
              name={user.user_name}
              bg="brand.500"
              color="white"
              w="30px"
              h="30px"
              fontSize="13px"
            />
            {/* The name is noise on a phone; the avatar alone identifies
                the session and keeps the bar from wrapping. */}
            <Box ms="10px" textAlign="start" display={{ base: 'none', md: 'block' }}>
              <Text fontSize="13px" fontWeight="600" color={textColor} lineHeight="1.2" noOfLines={1} maxW="140px">
                {user.user_name}
              </Text>
              <Text fontSize="12px" color={mutedColor} lineHeight="1.2" noOfLines={1} maxW="140px">
                {user.user_id}
              </Text>
            </Box>
          </Flex>
        </MenuButton>

        <MenuList bg={menuBg} borderColor={menuBorder} minW="200px" py="6px" zIndex={1300}>
          <Box px="14px" py="8px" display={{ base: 'block', md: 'none' }}>
            <Text fontSize="12px" color={mutedColor}>
              {getLangText('HEADER_SIGNED_IN_AS')}
            </Text>
            <Text fontSize="14px" fontWeight="600" color={textColor} noOfLines={1}>
              {user.user_name}
            </Text>
          </Box>
          <Divider display={{ base: 'block', md: 'none' }} borderColor={menuBorder} />

          <NavLink to="/vendor/account/eshop/orders">
            <MenuItem borderRadius="md" fontSize="14px">
              <Icon as={FiUser} boxSize="16px" me="10px" color={mutedColor} />
              {getLangText('HEADER_MY_ACCOUNT')}
            </MenuItem>
          </NavLink>

          <MenuItem borderRadius="md" fontSize="14px" onClick={handleLogout}>
            <Icon as={FiLogOut} boxSize="16px" me="10px" color={mutedColor} />
            {getLangText('MENU_LOGOUT')}
          </MenuItem>
        </MenuList>
      </Menu>
    </Flex>
  );
};

export default ClientNavLinks;
