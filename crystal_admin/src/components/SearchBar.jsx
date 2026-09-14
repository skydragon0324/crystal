import React from 'react';
import {
  Input, InputGroup, InputLeftElement, useColorModeValue
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';

/**
 * Layout props (width, margins, display) land on the group; the ref and the
 * keyboard handlers land on the input itself, so a caller that drives this
 * from outside - the header's page jump, say - can focus it and read keys off
 * it without reaching through the DOM.
 */
const SearchBar = React.forwardRef(function SearchBar({
  placeholder, value, onChange, onSubmit, onFocus, onBlur, onKeyDown, borderRadius, ...rest
}, ref) {
  const searchIconColor = useColorModeValue('gray.700', 'white');
  const inputBg = useColorModeValue('secondaryGray.300', 'navy.900');
  const inputText = useColorModeValue('gray.700', 'gray.100');

  const handleKeyDown = (e) => {
    if (onKeyDown) onKeyDown(e);
    if (e.key === 'Enter' && onSubmit && !e.defaultPrevented) onSubmit();
  };

  return (
    <InputGroup w={{ base: '100%', md: '12.5rem' }} {...rest}>
      <InputLeftElement
        children={<SearchIcon color={searchIconColor} w="0.9375rem" h="0.9375rem" />}
      />
      <Input
        ref={ref}
        variant="search"
        fontSize="sm"
        bg={inputBg}
        color={inputText}
        fontWeight="500"
        _placeholder={{ color: 'gray.400', fontSize: '0.875rem' }}
        borderRadius={borderRadius || '1.875rem'}
        placeholder={placeholder || 'Search...'}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
      />
    </InputGroup>
  );
});

export default SearchBar;
