import React from 'react';
import {
  Menu, MenuButton, MenuItem, MenuList, Text, useColorModeValue,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import useLang from 'lang/useLang';

/**
 * Language picker.
 *
 * Renders nothing while English is the only catalogue registered - a
 * dropdown with one entry is a control that cannot be used, and it invites
 * the question of why the other languages are missing. Add a catalogue
 * under lang/locales and register it, and this appears on its own with no
 * further change here.
 */
const LanguageSelect = (props) => {
  const { locale, locales, setLocale } = useLang();

  const color = useColorModeValue('gray.500', 'gray.400');
  const menuBg = useColorModeValue('white', 'navy.800');
  const menuBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const activeColor = useColorModeValue('brand.500', 'brand.400');

  if (!locales || locales.length < 2) return null;

  const current = locales.filter((item) => item.code === locale)[0] || locales[0];

  return (
    <Menu placement="bottom-end" autoSelect={false} isLazy>
      <MenuButton {...props}>
        <Text fontSize="12px" color={color} display="flex" alignItems="center">
          {current.name}
          <ChevronDownIcon ms="2px" />
        </Text>
      </MenuButton>
      <MenuList bg={menuBg} borderColor={menuBorder} minW="150px" py="6px" zIndex={1300}>
        {locales.map((item) => (
          <MenuItem
            key={item.code}
            fontSize="14px"
            borderRadius="md"
            fontWeight={item.code === locale ? '700' : '500'}
            color={item.code === locale ? activeColor : undefined}
            onClick={() => setLocale(item.code)}
          >
            {item.name}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default LanguageSelect;
