import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Flex, Text, Input, Icon, Popover, PopoverTrigger, PopoverContent,
  PopoverBody, Tag, TagLabel, TagCloseButton, Wrap, WrapItem, Portal, Divider,
  useColorModeValue, useDisclosure
} from '@chakra-ui/react';
import { ChevronDownIcon, CheckIcon, CloseIcon, SearchIcon } from '@chakra-ui/icons';
import { getLangText } from 'lang/lang';

/** Options past this many stay hidden until the search narrows the list. */
const MAX_RENDERED = 200;

const SIZES = {
  sm: { h: '36px', px: '12px', fontSize: 'sm', radius: '12px' },
  md: { h: '44px', px: '16px', fontSize: 'sm', radius: '16px' },
};

// Options arrive from the API as numbers and from constants as strings for
// the same logical value, so identity is compared as text throughout.
const sameValue = (a, b) => String(a) === String(b);

/**
 * Searchable, checkable select built on Chakra primitives.
 *
 * This replaces react-select, which shipped its own emotion styles and had
 * to be re-skinned with a `styles` object at every call site to follow the
 * colour mode. Everything here is themed from Horizon tokens instead, so a
 * palette change reaches it for free.
 *
 * Options are `[{ value, label }]`. The picked value is handed back
 * untouched, so a caller that puts numbers in gets numbers out.
 *
 *   isMulti       renders checkboxes and returns an array
 *   isSearchable  defaults to on once the list is longer than 7
 *   isClearable   defaults to on for single, off for multi
 */
const SelectField = ({
  options, value, onChange, placeholder, isMulti, isSearchable, isClearable,
  isDisabled, isInvalid, size, name, emptyText, maxRendered, showSelectAll, ...rest
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const dims = SIZES[size] || SIZES.md;
  const list = useMemo(() => options || [], [options]);
  const searchable = isSearchable === undefined ? list.length > 7 : isSearchable;
  const clearable = isClearable === undefined ? !isMulti : isClearable;
  const cap = maxRendered || MAX_RENDERED;

  const bg = useColorModeValue('transparent', 'navy.800');
  const menuBg = useColorModeValue('white', 'navy.700');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.500');
  const hoverBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.100');
  const tagBg = useColorModeValue('#F2EFFF', 'whiteAlpha.200');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(0, 0, 0, 0.35)'
  );

  const selectedValues = useMemo(() => {
    if (isMulti) return Array.isArray(value) ? value : [];
    return value === null || value === undefined || value === '' ? [] : [value];
  }, [value, isMulti]);

  // A value with no matching option - not loaded yet, or a filter's "all"
  // sentinel - falls through to the placeholder rather than rendering blank.
  const selectedOptions = useMemo(
    () => selectedValues
      .map((v) => list.filter((o) => sameValue(o.value, v))[0])
      .filter(Boolean),
    [selectedValues, list]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((o) => String(o.label).toLowerCase().indexOf(term) >= 0);
  }, [list, search]);

  const shown = filtered.slice(0, cap);
  const hiddenCount = filtered.length - shown.length;

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      return;
    }
    const first = list.findIndex((o) => sameValue(o.value, selectedValues[0]));
    setHighlight(first >= 0 ? first : 0);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setHighlight(0); }, [search]);

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const node = listRef.current.querySelector('[data-highlighted="true"]');
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }, [highlight, isOpen]);

  // Escape has to close this popover and nothing else. A capture listener on
  // document runs before React's delegated handlers, so a surrounding modal
  // never sees the key and stays open.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onEsc = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => document.removeEventListener('keydown', onEsc, true);
  }, [isOpen, onClose]);

  const commit = useCallback((option) => {
    if (!option) return;

    if (isMulti) {
      const exists = selectedValues.some((v) => sameValue(v, option.value));
      onChange(exists
        ? selectedValues.filter((v) => !sameValue(v, option.value))
        : selectedValues.concat([option.value]));
      return;
    }

    onChange(option.value);
    onClose();
  }, [isMulti, selectedValues, onChange, onClose]);

  const clear = useCallback((event) => {
    if (event) event.stopPropagation();
    onChange(isMulti ? [] : null);
  }, [isMulti, onChange]);

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) { onOpen(); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => (shown.length ? (h + step + shown.length) % shown.length : 0));
      return;
    }
    if (event.key === 'Enter' || (event.key === ' ' && !searchable)) {
      event.preventDefault();
      if (!isOpen) { onOpen(); return; }
      commit(shown[highlight]);
      return;
    }
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const showClear = clearable && selectedOptions.length > 0 && !isDisabled;

  // Bulk controls act on what the search currently shows, not the whole
  // list - "select all" under an active filter meaning "all 4000 options"
  // is almost never what was intended.
  const allShownSelected =
    shown.length > 0 && shown.every((o) => selectedValues.some((v) => sameValue(v, o.value)));

  const toggleAllShown = () => {
    if (allShownSelected) {
      onChange(selectedValues.filter((v) => !shown.some((o) => sameValue(o.value, v))));
      return;
    }
    const additions = shown
      .map((o) => o.value)
      .filter((v) => !selectedValues.some((s) => sameValue(s, v)));
    onChange(selectedValues.concat(additions));
  };

  /** The square checkbox drawn beside each option in multi mode. */
  const renderCheckbox = (isSelected) => (
    <Flex
      align="center" justify="center"
      w="18px" h="18px" me="10px" flexShrink={0}
      borderRadius="6px" borderWidth="1.5px"
      borderColor={isSelected ? brandColor : borderColor}
      bg={isSelected ? brandColor : 'transparent'}
      transition="background .12s ease, border-color .12s ease"
    >
      {isSelected ? <Icon as={CheckIcon} w="9px" h="9px" color="white" /> : null}
    </Flex>
  );

  return (
    <Popover
      isOpen={isOpen && !isDisabled}
      onOpen={onOpen}
      onClose={onClose}
      matchWidth
      placement="bottom-start"
      gutter={6}
      isLazy
      closeOnBlur
      // Chakra only honours initialFocusRef when autoFocus is on, so the
      // search box would never take focus with autoFocus turned off.
      initialFocusRef={searchable ? searchRef : undefined}
      autoFocus={!!searchable}
    >
      <PopoverTrigger>
        <Flex
          role="button" tabIndex={isDisabled ? -1 : 0}
          aria-haspopup="listbox" aria-expanded={isOpen} aria-disabled={isDisabled}
          data-name={name}
          align="center" justify="space-between"
          minH={dims.h} px={dims.px} py={isMulti ? '6px' : '0px'}
          bg={bg} border="1px solid"
          borderColor={isInvalid ? 'red.500' : isOpen ? brandColor : borderColor}
          borderRadius={dims.radius}
          cursor={isDisabled ? 'not-allowed' : 'pointer'}
          opacity={isDisabled ? 0.5 : 1}
          transition="border-color .15s ease"
          _hover={{ borderColor: isDisabled ? borderColor : brandColor }}
          _focus={{ borderColor: brandColor, boxShadow: 'none' }}
          onClick={() => (isDisabled ? null : (isOpen ? onClose() : onOpen()))}
          onKeyDown={isDisabled ? undefined : onKeyDown}
          {...rest}
        >
          <Box flex="1" minW="0" overflow="hidden">
            {isMulti && selectedOptions.length ? (
              <Wrap spacing="6px" py="2px">
                {selectedOptions.map((o) => (
                  <WrapItem key={String(o.value)}>
                    <Tag size="sm" borderRadius="10px" bg={tagBg} color={textColor}>
                      <TagLabel fontSize="xs">{o.label}</TagLabel>
                      <TagCloseButton onClick={(e) => { e.stopPropagation(); commit(o); }} />
                    </Tag>
                  </WrapItem>
                ))}
              </Wrap>
            ) : selectedOptions.length && !isMulti ? (
              <Text color={textColor} fontSize={dims.fontSize} noOfLines={1}>
                {selectedOptions[0].label}
              </Text>
            ) : (
              <Text color={mutedColor} fontSize={dims.fontSize} noOfLines={1}>
                {placeholder || getLangText('SELECT_PLACEHOLDER')}
              </Text>
            )}
          </Box>

          <Flex align="center" ms="8px" flexShrink="0">
            {showClear ? (
              <Box
                as="span" role="button" aria-label={getLangText('SELECT_CLEAR')}
                onClick={clear} p="4px" me="2px" lineHeight="0"
                color={mutedColor} _hover={{ color: brandColor }}
              >
                <Icon as={CloseIcon} w="8px" h="8px" />
              </Box>
            ) : null}
            <Icon
              as={ChevronDownIcon} w="18px" h="18px" color={mutedColor}
              transform={isOpen ? 'rotate(180deg)' : 'none'} transition="transform .2s ease"
            />
          </Flex>
        </Flex>
      </PopoverTrigger>

      <Portal>
        <PopoverContent
          data-no-focus-lock
          bg={menuBg} border="1px solid" borderColor={borderColor}
          borderRadius="16px" boxShadow={shadow} overflow="hidden"
          _focus={{ boxShadow: shadow, outline: 'none' }}
          w="100%" minW="200px"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        >
          <PopoverBody p="0">
            {searchable ? (
              <Flex
                align="center" px="12px" py="8px"
                borderBottom="1px solid" borderColor={borderColor}
              >
                <Icon as={SearchIcon} w="12px" h="12px" color={mutedColor} me="8px" />
                <Input
                  ref={searchRef}
                  variant="unstyled" fontSize="sm" color={textColor}
                  placeholder={getLangText('SELECT_SEARCH')}
                  _placeholder={{ color: mutedColor }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={onKeyDown}
                />
              </Flex>
            ) : null}

            {isMulti && showSelectAll !== false && shown.length > 1 ? (
              <>
                <Flex align="center" justify="space-between" px="14px" py="8px">
                  <Flex
                    as="button" type="button" align="center"
                    onClick={toggleAllShown}
                    color={mutedColor} _hover={{ color: brandColor }}
                  >
                    {renderCheckbox(allShownSelected)}
                    <Text fontSize="xs" fontWeight="600">
                      {allShownSelected
                        ? getLangText('SELECT_CLEAR_ALL')
                        : getLangText('SELECT_SELECT_ALL')}
                    </Text>
                  </Flex>
                  {selectedValues.length ? (
                    <Text fontSize="xs" color={mutedColor}>
                      {getLangText('SELECT_SELECTED_COUNT', [selectedValues.length])}
                    </Text>
                  ) : null}
                </Flex>
                <Divider borderColor={borderColor} />
              </>
            ) : null}

            <Box ref={listRef} maxH="260px" overflowY="auto" py="6px" role="listbox">
              {shown.length ? (
                shown.map((o, index) => {
                  const isSelected = selectedValues.some((v) => sameValue(v, o.value));
                  const isHighlighted = index === highlight;
                  return (
                    <Flex
                      key={String(o.value)}
                      role="option" aria-selected={isSelected}
                      data-highlighted={isHighlighted ? 'true' : 'false'}
                      align="center" justify="space-between"
                      px="14px" py="8px" mx="6px" borderRadius="10px"
                      cursor="pointer"
                      bg={isHighlighted ? hoverBg : 'transparent'}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => commit(o)}
                    >
                      <Flex align="center" minW="0">
                        {isMulti ? renderCheckbox(isSelected) : null}
                        <Text
                          fontSize="sm" color={textColor} noOfLines={1}
                          fontWeight={isSelected ? '700' : '500'}
                        >
                          {o.label}
                        </Text>
                      </Flex>
                      {!isMulti && isSelected ? (
                        <Icon as={CheckIcon} w="12px" h="12px" color={brandColor} ms="10px" />
                      ) : null}
                    </Flex>
                  );
                })
              ) : (
                <Text fontSize="sm" color={mutedColor} px="16px" py="14px">
                  {emptyText || getLangText('SELECT_NO_RESULTS')}
                </Text>
              )}

              {hiddenCount > 0 ? (
                <Text fontSize="xs" color={mutedColor} px="16px" pt="8px" pb="4px">
                  {getLangText('SELECT_TRUNCATED', [hiddenCount])}
                </Text>
              ) : null}
            </Box>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

export default SelectField;
