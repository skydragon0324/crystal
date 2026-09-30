import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Flex, Text, Input, Icon, Popover, PopoverTrigger, PopoverContent,
  PopoverBody, Tag, TagLabel, TagCloseButton, Wrap, WrapItem, Portal, Spinner,
  useColorModeValue, useDisclosure
} from '@chakra-ui/react';
import { ChevronDownIcon, CheckIcon, CloseIcon, SearchIcon } from '@chakra-ui/icons';
import { useI18n } from '../i18n';

/**
 * How many options are put in the DOM at a time.  The list grows by another
 * chunk as it is scrolled, so a 2000 company dropdown opens instantly instead
 * of mounting two thousand rows up front.
 */
const CHUNK_SIZE = 50;

/**
 * The most rows the list will mount just to open on a selection.
 *
 * Opening used to mount every row up to the selected one, which is fine at
 * twenty options and locks the tab up at two thousand - the company picker on
 * the Base screens lists every company there is.  Past this many the list
 * simply opens at the top: the closed control already shows what is selected,
 * and searching is how anybody finds a name in a list that long anyway.
 */
const MAX_INITIAL_ROWS = CHUNK_SIZE * 3;

/** Distance from the bottom, in px, at which the next chunk is pulled in. */
const LOAD_THRESHOLD = 120;

const SIZES = {
  sm: { h: '2.25rem', px: '0.75rem', fontSize: 'sm', radius: '0.75rem' },
  md: { h: '2.75rem', px: '1rem', fontSize: 'sm', radius: '1rem' }
};

const sameValue = (a, b) => String(a) === String(b);

/**
 * Searchable single/multi select that follows the Horizon input styling and
 * both colour modes.  Options are `[{ value, label }]`; the picked `value` is
 * handed back untouched, so callers keep whatever type they put in.
 */
export default function SelectField({
  options, value, onChange, placeholder, isMulti, isSearchable, isClearable,
  isDisabled, isInvalid, size, name, emptyText, maxRendered, ...rest
}) {
  const { t } = useI18n();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState(0);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const dims = SIZES[size] || SIZES.md;
  const list = useMemo(() => options || [], [options]);
  const searchable = isSearchable === undefined ? list.length > 7 : isSearchable;
  const clearable = isClearable === undefined ? !isMulti : isClearable;
  const chunk = maxRendered || CHUNK_SIZE;

  /** How much of the filtered list is currently mounted. */
  const [visibleCount, setVisibleCount] = useState(chunk);

  /*
   * THE CONSOLE'S OWN RAMPS, in both modes.
   *
   * These were Horizon's leftovers: a #A3AED0 blue-grey for muted text in
   * the light mode and #5A6A9A in the dark. That second one is the one that
   * showed - it is a mid-blue chosen against a #0C1533 navy panel, and this
   * console's dark surfaces are near-black, so every placeholder, hint and
   * "nothing matches" line sat at about 2:1 against its background. The
   * borders were whiteAlpha.100, which is fainter still.
   *
   * They are the navy and slate ramps now - the same ones useSurface reads,
   * so a select looks like the card it is sitting on.
   */
  const bg = useColorModeValue('transparent', 'navy.800');
  const menuBg = useColorModeValue('white', 'navy.700');
  const borderColor = useColorModeValue('secondaryGray.100', 'navy.600');
  const textColor = useColorModeValue('secondaryGray.900', 'navy.50');
  const mutedColor = useColorModeValue('secondaryGray.600', 'navy.200');
  const hoverBg = useColorModeValue('secondaryGray.300', 'navy.600');
  const tagBg = useColorModeValue('brand.50', 'navy.600');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(0, 0, 0, 0.35)'
  );

  const selectedValues = useMemo(() => {
    if (isMulti) return Array.isArray(value) ? value : [];
    return value === null || value === undefined ? [] : [value];
  }, [value, isMulti]);

  // Values with no matching option (not loaded yet, or a filter's "all" empty
  // string) simply fall through to the placeholder.
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

  const shown = filtered.slice(0, visibleCount);
  const hiddenCount = filtered.length - shown.length;

  /**
   * Mounts enough of the list to include `index`, so keyboard navigation is
   * not trapped at the bottom of what scrolling happened to have loaded.
   */
  const ensureVisible = useCallback((index) => {
    setVisibleCount((current) => (
      index < current ? current : Math.min(filtered.length, index + chunk)
    ));
  }, [filtered.length, chunk]);

  const onListScroll = useCallback((event) => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_THRESHOLD) return;

    setVisibleCount((current) => (
      current >= filtered.length ? current : Math.min(filtered.length, current + chunk)
    ));
  }, [filtered.length, chunk]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      return;
    }
    // Opening on a selection deep in the list has to mount enough rows to
    // reach it, otherwise the highlight points at nothing.
    const first = list.findIndex((o) => sameValue(o.value, selectedValues[0]));
    const reach = first >= 0 ? Math.min(list.length, first + chunk) : chunk;

    setHighlight(first >= 0 ? first : 0);
    setVisibleCount(Math.min(reach, Math.max(chunk, MAX_INITIAL_ROWS)));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new search term is a new list; start it from the top again.
  useEffect(() => {
    setHighlight(0);
    setVisibleCount(chunk);
  }, [search, chunk]);

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const node = listRef.current.querySelector('[data-highlighted="true"]');
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }, [highlight, isOpen]);


  // Escape has to close this popover and nothing else.  A capture listener on
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
      if (!filtered.length) return;

      // Wrapping over the whole filtered list, not just the mounted slice, so
      // arrowing down keeps pulling more of it in.
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = (highlight + step + filtered.length) % filtered.length;
      ensureVisible(next);
      setHighlight(next);
      return;
    }
    if (event.key === 'Enter' || (event.key === ' ' && !searchable)) {
      event.preventDefault();
      if (!isOpen) { onOpen(); return; }
      commit(filtered[highlight]);
      return;
    }
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      // Do not let a surrounding modal treat this as "close the dialog".
      event.stopPropagation();
      onClose();
    }
  };

  const showClear = clearable && selectedOptions.length > 0 && !isDisabled;

  // Chakra only honours initialFocusRef when autoFocus is on, so the search box
  // would never receive focus with autoFocus turned off.
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
      initialFocusRef={searchable ? searchRef : undefined}
      autoFocus={!!searchable}
    >
      <PopoverTrigger>
        <Flex
          role="button" tabIndex={isDisabled ? -1 : 0}
          aria-haspopup="listbox" aria-expanded={isOpen} aria-disabled={isDisabled}
          data-name={name}
          align="center" justify="space-between"
          minH={dims.h} px={dims.px} py={isMulti ? '0.375rem' : '0px'}
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
              <Wrap spacing="0.375rem" py="2px">
                {selectedOptions.map((o) => (
                  <WrapItem key={String(o.value)}>
                    <Tag size="sm" borderRadius="0.625rem" bg={tagBg} color={textColor}>
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
                {placeholder || t('form.select')}
              </Text>
            )}
          </Box>

          <Flex align="center" ms="0.5rem" flexShrink="0">
            {showClear ? (
              <Box
                as="span" role="button" aria-label={t('form.clearSelection')}
                onClick={clear} p="0.25rem" me="2px" lineHeight="0"
                color={mutedColor} _hover={{ color: brandColor }}
              >
                <Icon as={CloseIcon} w="0.5rem" h="0.5rem" />
              </Box>
            ) : null}
            <Icon
              as={ChevronDownIcon} w="1.125rem" h="1.125rem" color={mutedColor}
              transform={isOpen ? 'rotate(180deg)' : 'none'} transition="transform .2s ease"
            />
          </Flex>
        </Flex>
      </PopoverTrigger>

      <Portal>
        <PopoverContent
          data-no-focus-lock
          /*
           * ABOVE the dialog that opened it.
           *
           * Chakra puts the panel inside a `.chakra-popover__popper` wrapper
           * whose theme style is `z-index: inherit`.  Portalled to <body>
           * that inherits `auto`, while a modal's own container carries 1400
           * - so a select opened inside a form dialog rendered UNDERNEATH it.
           *
           * The stylesheet also raises `.chakra-popover__popper`, and that
           * rule is worth keeping for any popover this file does not own; but
           * it cannot be relied on alone, because emotion injects Chakra's
           * `inherit` at render time and whichever <style> lands last wins.
           * A style PROP always beats the component's `__css`, so this is the
           * half that cannot lose the race.
           */
          rootProps={{ zIndex: 1500 }}
          bg={menuBg} border="1px solid" borderColor={borderColor}
          borderRadius="0.5rem" boxShadow={shadow} overflow="hidden"
          _focus={{ boxShadow: shadow, outline: 'none' }}
          w="100%" minW="12.5rem"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
          }}
        >
          <PopoverBody p="0">
            {searchable ? (
              <Flex
                align="center" px="0.75rem" py="0.5rem"
                borderBottom="1px solid" borderColor={borderColor}
              >
                <Icon as={SearchIcon} w="0.75rem" h="0.75rem" color={mutedColor} me="0.5rem" />
                <Input
                  ref={searchRef}
                  variant="unstyled" fontSize="sm" color={textColor}
                  placeholder={t('form.search')}
                  _placeholder={{ color: mutedColor }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={onKeyDown}
                />
              </Flex>
            ) : null}

            <Box
              ref={listRef} maxH="16.25rem" overflowY="auto" py="0.375rem" role="listbox"
              onScroll={onListScroll}
            >
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
                      px="0.875rem" py="0.5rem" mx="0.375rem" borderRadius="0.625rem"
                      cursor="pointer"
                      bg={isHighlighted ? hoverBg : 'transparent'}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => commit(o)}
                    >
                      <Text
                        fontSize="sm" color={textColor} noOfLines={1}
                        fontWeight={isSelected ? '700' : '500'}
                      >
                        {o.label}
                      </Text>
                      {isSelected ? (
                        <Icon as={CheckIcon} w="0.75rem" h="0.75rem" color={brandColor} ms="0.625rem" />
                      ) : null}
                    </Flex>
                  );
                })
              ) : (
                <Text fontSize="sm" color={mutedColor} px="1rem" py="0.875rem">
                  {emptyText || t('form.noMatches')}
                </Text>
              )}

              {/*
                A sentinel rather than a dead end: scrolling this into view is
                what triggers the next chunk, so the count is a progress note,
                not an instruction to go and type something.
              */}
              {hiddenCount > 0 ? (
                <Flex align="center" justify="center" gap="0.5rem" data-gap="8" px="1rem" pt="0.625rem" pb="0.375rem">
                  <Spinner size="xs" color={mutedColor} speed="0.8s" />
                  <Text fontSize="xs" color={mutedColor}>
                    {t('form.moreBelow', { count: hiddenCount })}
                  </Text>
                </Flex>
              ) : filtered.length > chunk ? (
                <Text fontSize="xs" color={mutedColor} px="1rem" pt="0.5rem" pb="0.25rem" textAlign="center">
                  {t('form.allShown', { count: filtered.length })}
                </Text>
              ) : null}
            </Box>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
