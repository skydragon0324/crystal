import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Flex, Grid, Text, Icon, Button, Popover, PopoverTrigger, PopoverContent,
  PopoverBody, Portal, useColorModeValue, useDisclosure
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, CloseIcon } from '@chakra-ui/icons';
import { useI18n } from '../i18n';
import useDismissOnOutside from '../hooks/useDismissOnOutside';
import {
  toISODate, parseISODate, addMonths, startOfMonth, buildCalendarGrid,
  monthNames, weekdayNames, formatDisplayDate, isSameDay, isOutOfRange
} from '../utils/date';

const SIZES = {
  sm: { h: '2.25rem', px: '0.75rem', radius: '0.75rem' },
  md: { h: '2.75rem', px: '1rem', radius: '1rem' }
};

/** Years shown at once in the year view; the arrows page by this much. */
const YEAR_PAGE = 20;

/**
 * Calendar picker with drill-down month and year views.
 *
 * The value is a plain 'YYYY-MM-DD' string in and out, matching what the API
 * stores, so a pick never shifts across a timezone boundary.  Day, month and
 * weekday names come from Intl for the active locale and every button label
 * from the i18n dictionary, so nothing here is hard coded to English.
 *
 * The month and year views are drawn inside the same panel rather than in
 * nested popovers - a popover inside a popover closes its parent on blur.
 */
export default function DatePicker({
  value, onChange, placeholder, isDisabled, isInvalid, isClearable,
  min, max, size, name, ...rest
}) {
  const { t, intlLocale, weekStartsOn } = useI18n();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  useDismissOnOutside(isOpen, onClose, [triggerRef, panelRef]);

  const dims = SIZES[size] || SIZES.md;
  const selected = parseISODate(value);
  const today = new Date();

  const [viewDate, setViewDate] = useState(() => startOfMonth(selected || today));
  const [view, setView] = useState('days');

  // Re-centre on the current value every time the panel is reopened.
  useEffect(() => {
    if (!isOpen) return;
    setViewDate(startOfMonth(parseISODate(value) || new Date()));
    setView('days');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const bg = useColorModeValue('transparent', 'navy.800');
  const panelBg = useColorModeValue('white', 'navy.700');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('#A3AED0', '#5A6A9A');
  const outsideColor = useColorModeValue('secondaryGray.500', 'whiteAlpha.400');
  const hoverBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.100');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const weekendColor = 'red.500';
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(0, 0, 0, 0.35)'
  );

  /*
   * Names and the closed-field format come from the dictionary when it has
   * an opinion, and from Intl when it does not.  t() returns the key itself
   * for anything unwritten, so a key left blank in the dictionary reads as
   * "no override" here rather than printing 'date.weekdays' into the header.
   */
  const named = (key) => {
    const text = t(key);
    return !text || text === key ? null : text;
  };

  const months = useMemo(
    () => monthNames(intlLocale, 'long', named('date.months')),
    [intlLocale, t]                                          // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shortMonths = useMemo(
    () => monthNames(intlLocale, 'short', named('date.monthsShort')),
    [intlLocale, t]                                          // eslint-disable-line react-hooks/exhaustive-deps
  );
  const weekdays = useMemo(
    () => weekdayNames(intlLocale, weekStartsOn, 'short', named('date.weekdays')),
    [intlLocale, weekStartsOn, t]                            // eslint-disable-line react-hooks/exhaustive-deps
  );
  const displayPattern = named('date.format');

  const cells = useMemo(
    () => buildCalendarGrid(viewDate.getFullYear(), viewDate.getMonth(), weekStartsOn),
    [viewDate, weekStartsOn]
  );

  const yearBlockStart = Math.floor(viewDate.getFullYear() / YEAR_PAGE) * YEAR_PAGE;
  const yearBlock = useMemo(() => {
    const out = [];
    for (let i = 0; i < YEAR_PAGE; i++) out.push(yearBlockStart + i);
    return out;
  }, [yearBlockStart]);


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

  const pick = (date) => {
    onChange(toISODate(date));
    onClose();
  };

  const step = (direction) => {
    if (view === 'days') setViewDate(addMonths(viewDate, direction));
    else if (view === 'months') setViewDate(new Date(viewDate.getFullYear() + direction, viewDate.getMonth(), 1));
    else setViewDate(new Date(viewDate.getFullYear() + direction * YEAR_PAGE, viewDate.getMonth(), 1));
  };

  const caption = () => {
    if (view === 'days') return months[viewDate.getMonth()] + ' ' + viewDate.getFullYear();
    if (view === 'months') return String(viewDate.getFullYear());
    return yearBlockStart + ' - ' + (yearBlockStart + YEAR_PAGE - 1);
  };

  const cycleView = () => {
    setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days');
  };

  const cellStyle = (isSelected) => ({
    borderRadius: '0.625rem',
    bg: isSelected ? brandColor : 'transparent',
    cursor: 'pointer',
    transition: 'background .15s ease',
    _hover: { bg: isSelected ? brandColor : hoverBg }
  });

  const showClear = isClearable !== false && !!value && !isDisabled;

  return (
    <Popover
      isOpen={isOpen && !isDisabled}
      onOpen={onOpen}
      onClose={onClose}
      placement="bottom-start"
      gutter={6}
      isLazy
      closeOnBlur
      autoFocus={false}
    >
      <PopoverTrigger>
        <Flex
          ref={triggerRef}
          role="button" tabIndex={isDisabled ? -1 : 0}
          aria-haspopup="dialog" aria-expanded={isOpen} aria-disabled={isDisabled}
          aria-label={t('datepicker.openCalendar')}
          data-name={name}
          align="center" justify="space-between"
          h={dims.h} px={dims.px}
          bg={bg} border="1px solid"
          borderColor={isInvalid ? 'red.500' : isOpen ? brandColor : borderColor}
          borderRadius={dims.radius}
          cursor={isDisabled ? 'not-allowed' : 'pointer'}
          opacity={isDisabled ? 0.5 : 1}
          transition="border-color .15s ease"
          _hover={{ borderColor: isDisabled ? borderColor : brandColor }}
          _focus={{ borderColor: brandColor, boxShadow: 'none' }}
          onClick={() => (isDisabled ? null : (isOpen ? onClose() : onOpen()))}
          onKeyDown={(e) => {
            if (isDisabled) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
            if (e.key === 'Escape' && isOpen) { e.stopPropagation(); onClose(); }
          }}
          {...rest}
        >
          <Text fontSize="sm" noOfLines={1} color={value ? textColor : mutedColor}>
            {value
              ? formatDisplayDate(value, intlLocale, displayPattern, months, shortMonths)
              : (placeholder || t('datepicker.selectADate'))}
          </Text>

          <Flex align="center" ms="0.5rem" flexShrink="0">
            {showClear ? (
              <Box
                as="span" role="button" aria-label={t('common.clear')}
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                p="0.25rem" me="2px" lineHeight="0"
                color={mutedColor} _hover={{ color: brandColor }}
              >
                <Icon as={CloseIcon} w="0.5rem" h="0.5rem" />
              </Box>
            ) : null}
            <Icon as={CalendarIcon} w="0.875rem" h="0.875rem" color={mutedColor} />
          </Flex>
        </Flex>
      </PopoverTrigger>

      <Portal>
        <PopoverContent
          ref={panelRef}
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
          bg={panelBg} border="1px solid" borderColor={borderColor}
          borderRadius="0.625rem" boxShadow={shadow} overflow="hidden"
          _focus={{ boxShadow: shadow, outline: 'none' }}
          w="20rem" maxW="20rem"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
          }}
        >
          <PopoverBody p="1rem">
            <Flex align="center" justify="space-between" mb="0.75rem" gap="0.5rem" data-gap="8">
              <Button
                aria-label={t('datepicker.previousMonth')}
                variant="no-hover" bg={hoverBg} borderRadius="0.75rem"
                minW="2rem" w="2rem" h="2rem" p="0"
                onClick={() => step(-1)}
              >
                <Icon as={ChevronLeftIcon} w="1rem" h="1rem" color={textColor} />
              </Button>

              <Button
                variant="no-hover" bg="transparent" flex="1" h="2rem" px="0.5rem"
                fontSize="sm" fontWeight="700" color={textColor}
                _hover={{ bg: hoverBg }} borderRadius="0.75rem"
                onClick={cycleView}
              >
                {caption()}
              </Button>

              <Button
                aria-label={t('datepicker.nextMonth')}
                variant="no-hover" bg={hoverBg} borderRadius="0.75rem"
                minW="2rem" w="2rem" h="2rem" p="0"
                onClick={() => step(1)}
              >
                <Icon as={ChevronRightIcon} w="1rem" h="1rem" color={textColor} />
              </Button>
            </Flex>

            {view === 'days' ? (
              <>
                <Grid templateColumns="repeat(7, 1fr)" gap="2px" mb="0.25rem">
                  {weekdays.map((label, index) => (
                    <Flex key={label + index} justify="center" py="0.375rem">
                      <Text
                        fontSize="xs" fontWeight="700"
                        color={index === 0 || index === 6 ? weekendColor : mutedColor}
                      >
                        {label}
                      </Text>
                    </Flex>
                  ))}
                </Grid>

                <Grid templateColumns="repeat(7, 1fr)" gap="2px">
                  {cells.map((cell) => {
                    const disabled = isOutOfRange(cell.date, min, max);
                    const isSelected = isSameDay(cell.date, selected);
                    const isToday = isSameDay(cell.date, today);

                    return (
                      <Flex
                        key={toISODate(cell.date)}
                        as="button" type="button"
                        aria-label={toISODate(cell.date)}
                        aria-selected={isSelected}
                        disabled={disabled}
                        justify="center" align="center" h="2.25rem"
                        {...cellStyle(isSelected)}
                        border="1px solid"
                        borderColor={!isSelected && isToday ? brandColor : 'transparent'}
                        cursor={disabled ? 'not-allowed' : 'pointer'}
                        opacity={disabled ? 0.35 : 1}
                        _hover={{ bg: disabled ? 'transparent' : isSelected ? brandColor : hoverBg }}
                        onClick={() => (disabled ? null : pick(cell.date))}
                      >
                        <Text
                          fontSize="sm"
                          fontWeight={isSelected || isToday ? '700' : '500'}
                          color={isSelected ? 'white' : cell.inMonth ? textColor : outsideColor}
                        >
                          {cell.date.getDate()}
                        </Text>
                      </Flex>
                    );
                  })}
                </Grid>
              </>
            ) : view === 'months' ? (
              <Grid templateColumns="repeat(3, 1fr)" gap="0.375rem">
                {shortMonths.map((label, index) => {
                  const isSelected =
                    !!selected &&
                    selected.getFullYear() === viewDate.getFullYear() &&
                    selected.getMonth() === index;

                  return (
                    <Flex
                      key={label + index}
                      as="button" type="button"
                      justify="center" align="center" h="2.875rem"
                      {...cellStyle(isSelected)}
                      onClick={() => {
                        setViewDate(new Date(viewDate.getFullYear(), index, 1));
                        setView('days');
                      }}
                    >
                      <Text
                        fontSize="sm" fontWeight={isSelected ? '700' : '500'}
                        color={isSelected ? 'white' : textColor}
                      >
                        {label}
                      </Text>
                    </Flex>
                  );
                })}
              </Grid>
            ) : (
              <Grid templateColumns="repeat(4, 1fr)" gap="0.375rem">
                {yearBlock.map((year) => {
                  const isSelected = !!selected && selected.getFullYear() === year;

                  return (
                    <Flex
                      key={year}
                      as="button" type="button"
                      justify="center" align="center" h="2.5rem"
                      {...cellStyle(isSelected)}
                      onClick={() => {
                        setViewDate(new Date(year, viewDate.getMonth(), 1));
                        setView('months');
                      }}
                    >
                      <Text
                        fontSize="sm" fontWeight={isSelected ? '700' : '500'}
                        color={isSelected ? 'white' : textColor}
                      >
                        {year}
                      </Text>
                    </Flex>
                  );
                })}
              </Grid>
            )}

            <Flex justify="space-between" align="center" mt="0.875rem" gap="0.625rem" data-gap="10">
              <Button
                variant="subtle" size="sm" borderRadius="0.75rem" fontSize="xs"
                isDisabled={isOutOfRange(today, min, max)}
                onClick={() => pick(today)}
              >
                {t('datepicker.today')}
              </Button>
              <Button
                variant="subtle" size="sm" borderRadius="0.75rem" fontSize="xs"
                onClick={() => { onChange(''); onClose(); }}
              >
                {t('common.clear')}
              </Button>
            </Flex>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
