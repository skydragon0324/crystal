import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Icon,
  Input,
  Portal,
  SlideFade,
  Text,
  useColorModeValue
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * A searchable select, the storefront twin of the console's.
 *
 * The lists it picks from are genuinely long - twenty-six service centres,
 * fifteen provinces, every product in a section - and a native <select> gives
 * no way to search them.
 *
 * Three details that matter:
 *
 *   - options mount in CHUNKS of 50, so opening a long list does not stutter
 *     on the first keystroke;
 *   - Escape is CAPTURED on the input rather than bubbled - left to bubble it
 *     closes the surrounding modal as well;
 *   - the search text clears on close, so reopening shows the full list.
 *
 * IT ANIMATES, like the console's. The console's is built on Chakra's Popover
 * and gets a fade and a rise for nothing; this one is a hand-positioned portal
 * and appeared - and vanished - in a single frame, which reads as a glitch
 * rather than as a panel opening. `SlideFade` gives it the same movement, and
 * `unmountOnExit` is what lets the CLOSE animate too: the measured rectangle
 * is deliberately kept after close so there is still something to animate out
 * of, rather than the panel being torn out of the tree mid-fade.
 */

const CHUNK = 50;

export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  help,
  isRequired,
  isDisabled,
  allowEmpty,
  emptyLabel,
  isSearchable,
  size
}) {
  const t = useT();

  const surface = useSurface();

  /*
   * THE PANEL IS ONE STEP ABOVE THE CARD, not level with it.
   *
   * It was `surface.card`, which in dark mode is the same ink.800 as the card
   * the select usually sits on - so an open list was a block of identical
   * colour separated from the page by a single hairline, and the shadow that
   * was meant to lift it does almost nothing against a near-black ground.
   * A floating surface reads as floating by being LIGHTER, which is what the
   * console's own does (navy.700 over a navy.800 card).
   */
  const panelBg = useColorModeValue('white', 'ink.700');
  const panelBorder = useColorModeValue('ink.100', 'ink.500');
  const optionHover = useColorModeValue('ink.50', 'ink.600');

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(CHUNK);
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapper = useRef(null);
  const inputRef = useRef(null);

  /*
   * WHERE THE PANEL GOES, measured from the trigger.
   *
   * The list used to be an absolutely positioned child of this component,
   * which is fine on a page and wrong inside a dialog: a modal body scrolls,
   * so `overflow: auto` clips anything drawn outside it and the options were
   * simply invisible. That is why the feedback dialog looked like a select
   * that could not be opened.
   *
   * So the panel is PORTALLED to the body and positioned from the trigger
   * rectangle. Re-measured on open, and on scroll and resize while open,
   * because a fixed box does not travel with the page underneath it.
   */
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    const measure = () => {
      if (!wrapper.current) return;
      const box = wrapper.current.getBoundingClientRect();
      setRect({ top: box.bottom + 6, left: box.left, width: box.width, bottom: box.top });
    };

    measure();
    // `true` so a scroll inside the dialog counts, not only the window.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  const searchable = isSearchable !== false;
  const height = size === 'sm' ? '36px' : '40px';

  const items = useMemo(() => {
    const base = allowEmpty
      ? [{ value: '', label: emptyLabel || 'form.all' }].concat(options || [])
      : options || [];
    if (!query.trim()) return base;
    const needle = query.trim().toLowerCase();
    return base.filter((option) => String(option.label).toLowerCase().indexOf(needle) !== -1);
  }, [options, query, allowEmpty, emptyLabel]);

  const selected = useMemo(
    () => (options || []).filter((option) => String(option.value) === String(value))[0] || null,
    [options, value]
  );

  useEffect(() => {
    if (!open) return undefined;
    const onDocumentClick = (event) => {
      if (!wrapper.current) return;
      // The panel is no longer inside the wrapper, so containment alone
      // would treat every click on an option as a click outside.
      if (wrapper.current.contains(event.target)) return;
      if (event.target.closest && event.target.closest('[data-select-panel]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setVisible(CHUNK);
      setActiveIndex(0);
      if (searchable && inputRef.current) inputRef.current.focus();
    } else {
      setQuery('');
    }
  }, [open, searchable]);

  const commit = (option) => {
    onChange(option.value === '' ? null : option.value);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, items.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (items[activeIndex]) commit(items[activeIndex]);
    }
  };

  const onScroll = (event) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 40) {
      setVisible((current) => Math.min(current + CHUNK, items.length));
    }
  };

  return (
    <FormControl isInvalid={!!error} isRequired={isRequired} isDisabled={isDisabled}>
      {label && (
        <FormLabel fontSize="sm" fontWeight="600" mb="1.5">
          {t(label)}
        </FormLabel>
      )}

      <Box position="relative" ref={wrapper}>
        <Flex
          align="center"
          justify="space-between"
          gap="2" data-gap="8"
          h={height}
          px="3"
          borderRadius="8px"
          border="1px solid"
          borderColor={open ? 'brand.500' : surface.border}
          bg={isDisabled ? surface.raised : surface.card}
          cursor={isDisabled ? 'not-allowed' : 'pointer'}
          opacity={isDisabled ? 0.6 : 1}
          transition="border-color 150ms ease"
          onClick={() => !isDisabled && setOpen((current) => !current)}
        >
          <Text fontSize="sm" color={selected ? surface.text : surface.muted} isTruncated>
            {selected ? t(selected.label) : (placeholder ? t(placeholder) : (emptyLabel ? t(emptyLabel) : t('form.select')))}
          </Text>
          {/* The chevron turns over, so the trigger says which way the panel
              went even after it has finished moving. */}
          <Icon
            as={ChevronDownIcon}
            boxSize="4"
            color={surface.muted}
            transform={open ? 'rotate(180deg)' : 'none'}
            transition="transform 200ms ease"
          />
        </Flex>

        {rect && (
          <Portal>
          <Box
            /*
             * FIXED and portalled, above a dialog.
             *
             * 1500 clears Chakra's modal container at 1400 - the same number
             * the console had to use for its own select, and for the same
             * reason.
             *
             * The positioning is on THIS box and the animation on the one
             * inside it: a transform is what SlideFade animates, and putting
             * the two on one element means the closing panel slides from
             * wherever the transform left it rather than from the trigger.
             */
            position="fixed"
            zIndex={1500}
            top={`${rect.top}px`}
            left={`${rect.left}px`}
            width={`${rect.width}px`}
            /* A closed panel must not swallow clicks on what is under it. */
            pointerEvents={open ? 'auto' : 'none'}
          >
          <SlideFade in={open} offsetY="-8px" unmountOnExit>
          <Box
            data-select-panel=""
            bg={panelBg}
            border="1px solid"
            borderColor={panelBorder}
            borderRadius="10px"
            boxShadow={surface.shadowLifted}
            overflow="hidden"
          >
            {searchable && (
              <Box p="2" borderBottom="1px solid" borderColor={panelBorder}>
                <Input
                  ref={inputRef}
                  size="sm"
                  placeholder={t('form.search')}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisible(CHUNK);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onKeyDown}
                />
              </Box>
            )}

            <Box maxH="260px" overflowY="auto" onScroll={onScroll} py="1">
              {items.length === 0 && (
                <Text fontSize="sm" color={surface.muted} px="3" py="3">
                  {t('form.nothingMatches')}{query}”
                </Text>
              )}

              {items.slice(0, visible).map((option, index) => {
                const isSelected = String(option.value) === String(value === null ? '' : value);
                return (
                  <Flex
                    key={`${option.value}-${index}`}
                    px="3"
                    py="2"
                    fontSize="sm"
                    cursor="pointer"
                    align="center"
                    justify="space-between"
                    gap="2" data-gap="8"
                    bg={index === activeIndex ? optionHover : 'transparent'}
                    fontWeight={isSelected ? 600 : 400}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(option)}
                  >
                    <Text isTruncated>{t(option.label)}</Text>
                    {option.hint && (
                      <Text fontSize="xs" color={surface.muted} flexShrink={0}>
                        {option.hint}
                      </Text>
                    )}
                  </Flex>
                );
              })}
            </Box>
          </Box>
          </SlideFade>
          </Box>
          </Portal>
        )}
      </Box>

      {error && <FormErrorMessage fontSize="xs">{error}</FormErrorMessage>}
      {!error && help && <FormHelperText fontSize="xs">{help}</FormHelperText>}
    </FormControl>
  );
}
