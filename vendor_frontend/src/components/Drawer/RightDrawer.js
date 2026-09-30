import React from 'react';
import { Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, Text, useColorModeValue } from '@chakra-ui/react';
import { HSeparator } from 'components/Separator/Separator';

const RightDrawer = ({
  isOpen,
  onClose,
  title = "",
  placement="right",
  closeOnEsc = true,
  closeOnOverlayClick = true,
  maxW = "50%", // Default max width
  ps = "24px",
  pe = "40px",
  children
}) => {
  const bgDrawer = useColorModeValue("white", "var(--chakra-colors-gray-700)");

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      placement={placement}
      blockScrollOnMount={false}
      closeOnEsc={closeOnEsc}
      closeOnOverlayClick={closeOnOverlayClick}
    >
      <DrawerContent maxWidth={maxW} bg={bgDrawer}>
        <DrawerHeader pt="24px" px="24px">
          <DrawerCloseButton />
          <Text fontSize="xl" fontWeight="bold" my="16px">
            {title}
          </Text>
          <HSeparator />
        </DrawerHeader>
        <DrawerBody ps={ps} pe={pe}>
          {children}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default RightDrawer;
