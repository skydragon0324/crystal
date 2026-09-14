import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Flex, Grid, Text, Icon, Button, Popover, PopoverTrigger, PopoverContent,
  PopoverBody, Portal, useColorModeValue, useDisclosure
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, CloseIcon } from '@chakra-ui/icons';
import moment from 'moment';
import { getLangText } from 'lang/lang';

const SIZES = {
  sm: { h: '36px', px: '12px', radius: '12px' },
  md: { h: '44px', px: '16px', radius: '16px' },
};

/** Years shown at once in the year view; the arrows page by this much. */
const YEAR_PAGE = 20;

const MONTH_KEYS = [
  'TEXT_JANUARY', 'TEXT_FEBRARY', 'TEXT_MARCH', 'TEXT_APRIL', 'TEXT_MAY', 'TEXT_JUNE',
  'TEXT_JULY', 'TEXT_AUGUST', 'TEXT_SEPTEMBER', 'TEXT_OCTOBER', 'TEXT_NOVEMBER', 'TEXT_DECEMBER',
];

const WEEKDAY_KEYS = [
  'TEXT_SUNDAY', 'TEXT_MONDAY', 'TEXT_TUESDAY', 'TEXT_WEDNESDAY',
  'TEXT_THURSDAY', 'TEXT_FRIDAY', 'TEXT_SATURDAY',
];

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date, n) => new Date(date.getFullYear(), date.getMonth() + n, 1);

const isSameDay = (a, b) =>
  !!a && !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

const outOfRange = (date, min, max) => {
  if (min && date < new Date(min.getFullYear(), min.getMonth(), min.getDate())) return true;
  if (max && date > new Date(max.getFullYear(), max.getMonth(), max.getDate())) return true;
  return false;
};

/** Six weeks from the Sunday on or before the 1st - a fixed grid never reflows. */
const buildGrid = (year, month) => {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
};

/**
 * Calendar picker with drill-down month and year views.
 *
 * A drop-in for the old CustomDatePicker: the value is a Date (or "" when
 * empty) in and out, so pages keep passing convertDateFromString(...) in
 * and calling formatDbDate(...) on the way out with no change.
 *
 * react-date-picker was styled through a global .custom-date-picker class
 * in a stylesheet, which meant it never followed the colour mode and had
 * to be patched by hand every time the palette moved. This is built from
 * Horizon tokens and follows light and dark automatically.
 *
 * The month and year views are drawn inside the same panel rather than in
 * nested popovers - a popover inside a popover closes its parent on blur.
 */
const DatePicker = ({
  value, onChange, placeholder, disabled, isDisabled, isInvalid, isClearable,
  min, max, size, name, id, onBlur, ...rest
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const readOnly = disabled || isDisabled;
  const dims = SIZES[size] || SIZES.md;
  const selected = isValidDate(value) ? value : null;
  const today = new Date();

  const [viewDate, setViewDate] = useState(() => startOfMonth(selected || today));
  const [view, setView] = useState('days');

  // Re-centre on the current value every time the panel is reopened.
  useEffect(() => {
    if (!isOpen) return;
    setViewDate(startOfMonth(isValidDate(value) ? value : new Date()));
    setView('days');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const bg = useColorModeValue('transparent', 'navy.800');
  const panelBg = useColorModeValue('white', 'navy.700');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.500');
  const outsideColor = useColorModeValue('secondaryGray.600', 'whiteAlpha.400');
  const hoverBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.100');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(0, 0, 0, 0.35)'
  );

  const months = useMemo(() => MONTH_KEYS.map((key) => getLangText(key)), []);
  const weekdays = useMemo(() => WEEKDAY_KEYS.map((key) => getLangText(key)), []);

  const cells = useMemo(
    () => buildGrid(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate]
  );

  const yearBlockStart = Math.floor(viewDate.getFullYear() / YEAR_PAGE) * YEAR_PAGE;
  const yearBlock = useMemo(() => {
    const out = [];
    for (let i = 0; i < YEAR_PAGE; i += 1) out.push(yearBlockStart + i);
    return out;
  }, [yearBlockStart]);

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

  const pick = (date) => {
    onChange(date);
    onClose();
  };

  const step = (direction) => {
    if (view === 'days') setViewDate(addMonths(viewDate, direction));
    else if (view === 'months') setViewDate(new Date(viewDate.getFullYear() + direction, viewDate.getMonth(), 1));
    else setViewDate(new Date(viewDate.getFullYear() + direction * YEAR_PAGE, viewDate.getMonth(), 1));
  };

  const caption = () => {
    if (view === 'days') return getLangText('FORMAT_MONTH_YEAR', [viewDate.getFullYear(), viewDate.getMonth() + 1]) || `${months[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    if (view === 'months') return String(viewDate.getFullYear());
    return `${yearBlockStart} - ${yearBlockStart + YEAR_PAGE - 1}`;
  };

  const cycleView = () => {
    setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days');
  };

  const cellStyle = (isSelected) => ({
    borderRadius: '10px',
    bg: isSelected ? brandColor : 'transparent',
    cursor: 'pointer',
    transition: 'background .15s ease',
    _hover: { bg: isSelected ? brandColor : hoverBg },
  });

  const showClear = isClearable !== false && !!selected && !readOnly;

  return (
    <Popover
      isOpen={isOpen && !readOnly}
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
          role="button" tabIndex={readOnly ? -1 : 0}
          id={id}
          aria-haspopup="dialog" aria-expanded={isOpen} aria-disabled={readOnly}
          aria-label={getLangText('DATE_OPEN')}
          data-name={name}
          align="center" justify="space-between"
          h={dims.h} px={dims.px}
          bg={bg} border="1px solid"
          borderColor={isInvalid ? 'red.500' : isOpen ? brandColor : borderColor}
          borderRadius={dims.radius}
          cursor={readOnly ? 'not-allowed' : 'pointer'}
          opacity={readOnly ? 0.5 : 1}
          transition="border-color .15s ease"
          _hover={{ borderColor: readOnly ? borderColor : brandColor }}
          _focus={{ borderColor: brandColor, boxShadow: 'none' }}
          onBlur={onBlur}
          onClick={() => (readOnly ? null : (isOpen ? onClose() : onOpen()))}
          onKeyDown={(e) => {
            if (readOnly) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
            if (e.key === 'Escape' && isOpen) { e.stopPropagation(); onClose(); }
          }}
          {...rest}
        >
          <Text fontSize="sm" noOfLines={1} color={selected ? textColor : mutedColor}>
            {selected
              ? moment(selected).format('YYYY-MM-DD')
              : (placeholder || getLangText('DATE_PLACEHOLDER'))}
          </Text>

          <Flex align="center" ms="8px" flexShrink="0">
            {showClear ? (
              <Box
                as="span" role="button" aria-label={getLangText('DATE_CLEAR')}
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                p="4px" me="2px" lineHeight="0"
                color={mutedColor} _hover={{ color: brandColor }}
              >
                <Icon as={CloseIcon} w="8px" h="8px" />
              </Box>
            ) : null}
            <Icon as={CalendarIcon} w="14px" h="14px" color={mutedColor} />
          </Flex>
        </Flex>
      </PopoverTrigger>

      <Portal>
        <PopoverContent
          data-no-focus-lock
          bg={panelBg} border="1px solid" borderColor={borderColor}
          borderRadius="20px" boxShadow={shadow} overflow="hidden"
          _focus={{ boxShadow: shadow, outline: 'none' }}
          w="320px" maxW="320px"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        >
          <PopoverBody p="16px">
            <Flex align="center" justify="space-between" mb="12px" gridGap="8px">
              <Button
                aria-label={getLangText('DATE_PREV')}
                variant="no-hover" bg={hoverBg} borderRadius="12px"
                minW="32px" w="32px" h="32px" p="0"
                onClick={() => step(-1)}
              >
                <Icon as={ChevronLeftIcon} w="16px" h="16px" color={textColor} />
              </Button>

              <Button
                variant="no-hover" bg="transparent" flex="1" h="32px" px="8px"
                fontSize="sm" fontWeight="700" color={textColor}
                _hover={{ bg: hoverBg }} borderRadius="12px"
                onClick={cycleView}
              >
                {caption()}
              </Button>

              <Button
                aria-label={getLangText('DATE_NEXT')}
                variant="no-hover" bg={hoverBg} borderRadius="12px"
                minW="32px" w="32px" h="32px" p="0"
                onClick={() => step(1)}
              >
                <Icon as={ChevronRightIcon} w="16px" h="16px" color={textColor} />
              </Button>
            </Flex>

            {view === 'days' ? (
              <>
                <Grid templateColumns="repeat(7, 1fr)" gridGap="2px" mb="4px">
                  {weekdays.map((label, index) => (
                    <Flex key={`wd-${index}`} justify="center" py="6px">
                      <Text
                        fontSize="xs" fontWeight="700"
                        color={index === 0 || index === 6 ? 'red.500' : mutedColor}
                      >
                        {label}
                      </Text>
                    </Flex>
                  ))}
                </Grid>

                <Grid templateColumns="repeat(7, 1fr)" gridGap="2px">
                  {cells.map((cell, index) => {
                    const isDisabledCell = outOfRange(cell.date, min, max);
                    const isSelected = isSameDay(cell.date, selected);
                    const isToday = isSameDay(cell.date, today);

                    return (
                      <Flex
                        key={`d-${index}`}
                        as="button" type="button"
                        aria-label={moment(cell.date).format('YYYY-MM-DD')}
                        aria-selected={isSelected}
                        disabled={isDisabledCell}
                        justify="center" align="center" h="36px"
                        {...cellStyle(isSelected)}
                        border="1px solid"
                        borderColor={!isSelected && isToday ? brandColor : 'transparent'}
                        cursor={isDisabledCell ? 'not-allowed' : 'pointer'}
                        opacity={isDisabledCell ? 0.35 : 1}
                        _hover={{ bg: isDisabledCell ? 'transparent' : isSelected ? brandColor : hoverBg }}
                        onClick={() => (isDisabledCell ? null : pick(cell.date))}
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
              <Grid templateColumns="repeat(3, 1fr)" gridGap="6px">
                {months.map((label, index) => {
                  const isSelected =
                    !!selected &&
                    selected.getFullYear() === viewDate.getFullYear() &&
                    selected.getMonth() === index;

                  return (
                    <Flex
                      key={`m-${index}`}
                      as="button" type="button"
                      justify="center" align="center" h="46px"
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
              <Grid templateColumns="repeat(4, 1fr)" gridGap="6px">
                {yearBlock.map((year) => {
                  const isSelected = !!selected && selected.getFullYear() === year;

                  return (
                    <Flex
                      key={year}
                      as="button" type="button"
                      justify="center" align="center" h="40px"
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

            <Flex justify="space-between" align="center" mt="14px" gridGap="10px">
              <Button
                variant="lightBrand" size="sm" borderRadius="12px" fontSize="xs"
                isDisabled={outOfRange(today, min, max)}
                onClick={() => pick(today)}
              >
                {getLangText('DATE_TODAY')}
              </Button>
              <Button
                variant="light" size="sm" borderRadius="12px" fontSize="xs"
                onClick={() => { onChange(''); onClose(); }}
              >
                {getLangText('DATE_CLEAR')}
              </Button>
            </Flex>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

export default DatePicker;
