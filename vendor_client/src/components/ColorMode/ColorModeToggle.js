import React from 'react';
import { IconButton, useColorMode, useColorModeValue } from '@chakra-ui/react';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';
import { getLangText } from 'lang/lang';

/**
 * Light / dark switch.
 *
 * The icon shows the mode being switched TO, not the one in effect - a
 * moon while the page is light. That is the convention every OS uses for
 * this control, and the alternative reads as a status light nobody can
 * act on.
 *
 * Chakra persists the choice; nothing else needs to be stored here.
 */
const ColorModeToggle = (props) => {
  const { colorMode, toggleColorMode } = useColorMode();
  const isDark = colorMode === 'dark';

  const color = useColorModeValue('gray.600', 'gray.300');
  const hoverBg = useColorModeValue('gray.100', 'whiteAlpha.100');

  const label = getLangText(isDark ? 'TEXT_LIGHT_MODE' : 'TEXT_DARK_MODE');

  return (
    <IconButton
      aria-label={label}
      title={label}
      icon={isDark ? <SunIcon /> : <MoonIcon />}
      onClick={toggleColorMode}
      variant="ghost"
      size="sm"
      color={color}
      borderRadius="10px"
      _hover={{ bg: hoverBg }}
      {...props}
    />
  );
};

export default ColorModeToggle;
