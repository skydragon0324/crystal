import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Flex, IconButton, useColorModeValue, useDisclosure } from '@chakra-ui/react';
import { FiMenu, FiX } from 'react-icons/fi';
import ClientMobileMenu from './ClientMobileMenu';
import { HEADER_HEIGHT } from 'constants/siteNav';

/**
 * Mobile navigation trigger + panel.
 *
 * The panel drops straight down from underneath the header the way
 * mi.com/global does, rather than sliding in from a side. It is a fixed
 * box clipped by an outer wrapper, so the sliding content is masked off
 * above the header instead of travelling across it.
 *
 * headerOffset is the header's bottom edge, so the panel starts flush
 * under the bar. ClientHeader passes HEADER_HEIGHT.base; the default here
 * matches it for any other caller.
 */
const ClientDrawer = ({ iconColor, headerOffset = HEADER_HEIGHT.base }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const location = useLocation();
  const panelBg = useColorModeValue('white', 'navy.800');

  // Close on any navigation, including the browser back button.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Stop the page behind the panel from scrolling while it is open.
  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  return (
    <Flex display={{ base: 'flex', xl: 'none' }} alignItems="center">
      <IconButton
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
        variant="ghost"
        icon={isOpen ? <FiX size="22px" /> : <FiMenu size="22px" />}
        color={iconColor}
        w="40px"
        h="40px"
        zIndex={1401}
        onClick={isOpen ? onClose : onOpen}
      />

      {/* Clipping wrapper: masks the panel while it is above its own top
          edge, so it appears to unroll downward from the header. */}
      <Box
        position="fixed"
        left="0"
        right="0"
        top={`${headerOffset}px`}
        bottom="0"
        overflow="hidden"
        zIndex={1400}
        pointerEvents={isOpen ? 'auto' : 'none'}
        aria-hidden={!isOpen}
      >
        <Box
          h="100%"
          bg={panelBg}
          overflowY="auto"
          sx={{ WebkitOverflowScrolling: 'touch' }}
          transform={isOpen ? 'translateY(0)' : 'translateY(-100%)'}
          transition="transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
          boxShadow={isOpen ? '0 12px 24px rgba(0,0,0,0.08)' : 'none'}
        >
          <ClientMobileMenu onClose={onClose} />
        </Box>
      </Box>
    </Flex>
  );
};

export default ClientDrawer;
