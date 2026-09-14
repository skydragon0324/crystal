import React, { useState } from 'react';
import {
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiSearch } from 'react-icons/fi';

export const SearchBar = (props) => {
  // Pass the computed styles into the `__css` prop
  const { variant, children, w="200px", placeholder = "", disabled, onSearch, ...rest } = props;
  const [keyword, setKeyword] = useState("");
  // Chakra Color Mode
  const searchIconColor = useColorModeValue("secondaryGray.700", "white");
  const borderColor = useColorModeValue("secondaryGray.100", "whiteAlpha.100");
  // Horizon's search field is a tinted pill, not a white bordered box -
  // it sits inside a white card, so a white fill would disappear.
  const inputBg = useColorModeValue("secondaryGray.300", "navy.900");

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      onSearch(keyword);
    }
  }

  return (
    <InputGroup borderRadius="16px" w={w} {...rest}>
      <InputLeftElement
        children={
          <IconButton
            bg="inherit"
            borderRadius="inherit"
            _hover="none"
            _active={{
              bg: "inherit",
              transform: "none",
              borderColor: "transparent",
            }}
            _focus={{
              boxShadow: "none",
            }}
            icon={
              <FiSearch color={searchIconColor} w="15px" h="15px" />
            }
            disabled={disabled}
          />
        }
      />
      <Input
        variant="search"
        fontSize="sm"
        bg={inputBg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="16px"
        placeholder={placeholder}
        value={keyword}
        disabled={disabled}
        onChange={e => setKeyword(e.target.value)}
        onKeyDown={handleSearch}
      />
    </InputGroup>
  );
}
