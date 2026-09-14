import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Avatar, Box, Flex, HStack, Icon, IconButton, Menu, MenuButton, MenuDivider,
  MenuItem, MenuList, Text, Tooltip, useDisclosure
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { MdTune, MdVpnKey, MdExitToApp } from 'react-icons/md';

import PageJump from '../components/PageJump';
import NotificationsMenu from '../components/NotificationsMenu';
import ChangePasswordModal from '../components/ChangePasswordModal';
import SettingsDrawer from './SettingsDrawer';
import { signedOut } from '../app/authSlice';
import { auth } from '../api';
import { useI18n } from '../i18n';
import { useSurface } from '../theme/tokens';

/**
 * The bar across the top: where you are, what needs attention, who is signed
 * in, in what language, and the way out.
 *
 * The search box is the command palette - Ctrl+K from anywhere - and it
 * searches the menu and the data at once, because somebody arriving at a
 * search box has a model code or half a customer name, not the name of a
 * screen.
 *
 * The language and the colour mode are NOT here any more. They moved into the
 * settings drawer alongside the three appearance controls that arrived with
 * it - see SettingsDrawer. What is left on this bar is what somebody reaches
 * for while working, rather than what they set once and forget.
 */
export default function Navbar({ onOpenSidebar, title }) {
  const dispatch = useDispatch();
  const admin = useSelector((state) => state.auth.admin);
  const { t } = useI18n();
  const surface = useSurface();
  const password = useDisclosure();
  const settings = useDisclosure();

  const signOut = async () => {
    // Best effort: the trail is worth an entry, but a network failure must
    // not leave somebody unable to sign out.
    try { await auth.logout(); } catch (err) { /* going anyway */ }
    dispatch(signedOut());
  };

  return (
    <>
      <Flex
        as="header"
        align="center"
        gap={2} data-gap="8"
        px={4}
        h="3.5rem"
        bg={surface.card}
        borderBottom="1px solid"
        borderColor={surface.border}
        position="sticky"
        top={0}
        zIndex={10}
        flexShrink={0}
      >
        <IconButton
          aria-label={t('layout.menu')}
          icon={<HamburgerIcon />}
          size="sm"
          variant="ghost"
          display={{ base: 'inline-flex', lg: 'none' }}
          onClick={onOpenSidebar}
        />

        {/*
          * The collapse control is NOT here.  It lives on the seam between
          * the menu and the content - see AdminLayout - because that is the
          * edge it moves, and a button that moves an edge belongs on it.
          */}
        <Text fontWeight="600" fontSize="sm" noOfLines={1}>{title}</Text>

        <HStack ml="auto" spacing={1}>
          <PageJump />

          <NotificationsMenu iconColor={surface.muted} />

          {/*
            * ONE CONTROL INSTEAD OF TWO ICONS.
            *
            * Language and colour mode used to sit here as glyphs. They are
            * settings somebody chooses once rather than things reached for
            * while working, and there are five of them now - so they live
            * behind this, and the toolbar keeps only what the job needs.
            */}
          <Tooltip label={t('settings.appearance')} openDelay={400}>
            <IconButton
              aria-label={t('settings.appearance')}
              icon={<Icon as={MdTune} w="1.0625rem" h="1.0625rem" />}
              size="sm"
              variant="ghost"
              onClick={settings.onOpen}
            />
          </Tooltip>

          <Menu placement="bottom-end">
            <MenuButton ms="0.25rem">
              <HStack spacing={2}>
                <Avatar
                  size="xs" borderRadius="0.375rem"
                  name={admin ? admin.name : ''} src={admin ? admin.avatar : null}
                />
                <Box textAlign="left" display={{ base: 'none', md: 'block' }}>
                  <Text fontSize="xs" fontWeight="600" lineHeight="1.2">
                    {admin ? admin.name : ''}
                  </Text>
                  <Text fontSize="0.625rem" color={surface.muted} lineHeight="1.2">
                    {admin ? admin.role_name : ''}
                  </Text>
                </Box>
              </HStack>
            </MenuButton>

            <MenuList minW="12.5rem">
              <Box px="0.625rem" py="0.375rem">
                <Text fontSize="sm" fontWeight="600">{admin ? admin.name : ''}</Text>
                <Text fontSize="xs" color={surface.muted}>{admin ? admin.username : ''}</Text>
              </Box>
              <MenuDivider />
              <MenuItem
                icon={<Icon as={MdVpnKey} w="0.9375rem" h="0.9375rem" />}
                onClick={password.onOpen}
              >
                {t('common.changePassword')}
              </MenuItem>
              <MenuItem
                icon={<Icon as={MdExitToApp} w="0.9375rem" h="0.9375rem" />}
                onClick={signOut}
              >
                {t('common.signOut')}
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>

      <ChangePasswordModal isOpen={password.isOpen} onClose={password.onClose} />
      <SettingsDrawer isOpen={settings.isOpen} onClose={settings.onClose} />
    </>
  );
}
