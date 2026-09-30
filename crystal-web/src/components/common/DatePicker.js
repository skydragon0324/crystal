import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Grid,
  Icon,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Portal,
  Text,
  useColorModeValue,
  useDisclosure,
  useFormControl
} from '@chakra-ui/react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@chakra-ui/icons';

import { useSurface } from '@/theme/tokens';
import { useI18n } from '@/i18n';
import { date as formatDate } from '@/utils/format';

/**
 * THE STOREFRONT'S DATE PICKER - the console's, brought across.
 *
 * The site used `<Input type="date">`, which is a different control in every
 * browser and in none of them the site's: Chrome draws its own calendar in
 * the OPERATING SYSTEM's language, so a member who picked 简体中文 in the
 * header was handed an English month grid, and the closed field printed the
 * date as 09/14/2026 or 14/09/2026 depending on the machine - neither of them
 * the YYYY.MM.DD the rest of the site writes. The console solved all of that
 * with crystal-admin/src/components/DatePicker.jsx, and this is that
 * component on the storefront's colours, catalogue and browser floor.
 *
 * WHAT IS THE SAME, deliberately:
 *
 *   'YYYY-MM-DD' STRINGS IN AND OUT, which is what the API takes, so a pick
 *   never crosses a timezone boundary - a Date object at local midnight is
 *   the previous day in UTC for everyone east of Greenwich.
 *
 *   DAYS, MONTHS AND YEARS IN ONE PANEL. The caption drills out to the months
 *   and then to twenty years at a time; picking one drills back in. A
 *   popover inside a popover closes its parent on blur, so the views are
 *   drawn in place rather than nested.
 *
 *   NAMES FROM Intl FOR THE ACTIVE LOCALE - the member's, not the browser's.
 *
 * WHAT IS DIFFERENT, and why:
 *
 *   THE CLOSED FIELD READS YYYY.MM.DD, through utils/format like every other
 *   date on the site, rather than Intl's medium date. A date is a timestamp
 *   here, not prose (see format.js), and the field that sets one should not
 *   be the only place it is spelled differently.
 *
 *   IT CAN BE DRIVEN ENTIRELY FROM THE KEYBOARD. The trigger is a real
 *   <button>; opening moves focus to the chosen day (or today); the arrows
 *   move a day or a week, PageUp/PageDown a month (with Shift, a year), Home
 *   and End the ends of the week, Enter picks and Escape closes and hands
 *   focus back. Only the cursor's cell is in the tab order, so Tab leaves the
 *   grid for the footer instead of walking forty-two days.
 *
 *   OUT OF RANGE IS OUT OF REACH AT EVERY LEVEL. `min` and `max` disable the
 *   days - as in the console - and also the months, years and arrows that
 *   lead only to disabled days, so the member is never shown a page with
 *   nothing on it they are allowed to pick.
 *
 *   THE WEEKEND IS SATURDAY AND SUNDAY, by the day, not by the column. The
 *   console colours columns 0 and 6, which on a Monday-first week is Monday
 *   and Sunday.
 *
 *   OUTSIDE-CLICK AND TAB-AWAY CLOSE IT, but focus merely disappearing does
 *   not. Chakra's closeOnBlur treats every blur with no destination as
 *   "left", and a month button that is replaced by the day grid under the
 *   pointer blurs to nowhere - so drilling in would have closed the panel.
 */

const SIZES = {
  sm: { h: '32px', px: '12px', fontSize: 'sm', icon: '12px' },
  md: { h: '40px', px: '16px', fontSize: 'md', icon: '14px' }
};

/** Years shown at once in the year view; its arrows page by this much. */
const YEAR_PAGE = 20;

/*
 * MONDAY FIRST, for every language the site offers. en-GB, zh-CN and ru-RU
 * all start the week on Monday, which is also why the console's per-locale
 * table says 1 for all three. A locale that starts on Sunday would add a
 * field to i18n's LOCALES, not a branch here.
 */
const WEEK_STARTS_ON = 1;

/* ------------------------------------------------------------------ */
/*  plain dates - local calendar fields only, never UTC                */
/* ------------------------------------------------------------------ */

const pad2 = (n) => (n < 10 ? '0' + n : String(n));

/** Date -> 'YYYY-MM-DD' from its LOCAL fields. */
export function toISODate(value) {
  if (!value) return '';
  return value.getFullYear() + '-' + pad2(value.getMonth() + 1) + '-' + pad2(value.getDate());
}

/**
 * 'YYYY-MM-DD' (or the date part of a timestamp) -> local midnight, or null.
 *
 * Built from the three numbers rather than `new Date(text)`, which reads a
 * bare date as UTC midnight and so as the previous day west of Greenwich.
 */
export function parseISODate(value) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  /* 2026-02-31 rolls into March; a date that does not exist is no date. */
  if (parsed.getMonth() !== Number(match[2]) - 1) return null;
  return parsed;
}

const dayOf = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const addDays = (value, count) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + count);

/** A month on, keeping the day where it can - 31 January + 1 is 28 February, not 3 March. */
function addMonths(value, count) {
  const first = new Date(value.getFullYear(), value.getMonth() + count, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(value.getDate(), last));
}

const sameDay = (a, b) => !!a && !!b
  && a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

/** Whether [from, to] lies wholly outside [min, max] - a day, a month or a year. */
function outside(from, to, min, max) {
  return (!!min && to < min) || (!!max && from > max);
}

const dayOutside = (value, min, max) => outside(value, value, min, max);

const monthOutside = (year, month, min, max) => outside(
  new Date(year, month, 1), new Date(year, month + 1, 0), min, max
);

const yearOutside = (year, min, max) => outside(new Date(year, 0, 1), new Date(year, 11, 31), min, max);

/** The day inside [min, max] nearest to `value`. */
function nearestInside(value, min, max) {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

/** Six full weeks around the month, so the grid never changes height. */
function weeksOf(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - WEEK_STARTS_ON + 7) % 7;
  const cells = [];
  for (let i = 0; i < 42; i += 1) cells.push(new Date(year, month, 1 - lead + i));
  return cells;
}

/* ------------------------------------------------------------------ */
/*  the names, from Intl for the member's language                     */
/* ------------------------------------------------------------------ */

function useNames(intlLocale) {
  return useMemo(() => {
    const monthShort = new Intl.DateTimeFormat(intlLocale, { month: 'short' });
    const weekday = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });

    const months = [];
    for (let m = 0; m < 12; m += 1) months.push(monthShort.format(new Date(2021, m, 1)));

    /* 2021-08-01 was a Sunday, so day d of the week is 1 + d August 2021. */
    const weekdays = [];
    for (let i = 0; i < 7; i += 1) {
      const day = (i + WEEK_STARTS_ON) % 7;
      weekdays.push({ day: day, label: weekday.format(new Date(2021, 7, 1 + day)) });
    }

    return {
      months: months,
      weekdays: weekdays,
      /* "September 2026", "2026年9月", "сентябрь 2026 г." - each its own order. */
      monthCaption: new Intl.DateTimeFormat(intlLocale, { year: 'numeric', month: 'long' }),
      /* What a screen reader says for a day: the whole date, in words. */
      spoken: new Intl.DateTimeFormat(intlLocale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }),
      monthLong: new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' })
    };
  }, [intlLocale]);
}

/* ------------------------------------------------------------------ */

export default function DatePicker(props) {
  const {
    value,
    onChange,
    placeholder,
    isClearable,
    min,
    max,
    size,
    name,
    /* Taken out so that neither reaches the wrapper `rest` is spread on. */
    id: ignoredId,
    isDisabled: ignoredDisabled,
    isInvalid: ignoredInvalid,
    isRequired: ignoredRequired,
    'aria-label': ariaLabel,
    ...rest
  } = props;

  const { t } = useI18n();
  const surface = useSurface();
  const { isOpen, onOpen, onClose } = useDisclosure();

  /*
   * INSIDE A <FormControl> IT BEHAVES LIKE AN INPUT: the label's `for` finds
   * it, and disabled, invalid and required come from the control rather than
   * having to be said twice.
   */
  const field = useFormControl({
    id: props.id,
    isDisabled: props.isDisabled,
    isInvalid: props.isInvalid,
    isRequired: props.isRequired
  });
  const disabled = !!field.disabled;
  const invalid = !!field['aria-invalid'];

  const dims = SIZES[size] || SIZES.md;
  const shown = value ? formatDate(value) : '';

  const wrapperRef = useRef(null);
  const contentRef = useRef(null);
  const buttonRef = useRef(null);

  const panelBg = useColorModeValue('white', 'ink.700');
  const panelBorder = useColorModeValue('ink.100', 'ink.500');
  const fieldBg = useColorModeValue('white', 'ink.800');
  const fieldBorder = useColorModeValue('ink.200', 'ink.600');

  /*
   * ESCAPE CLOSES THIS AND NOTHING ELSE. The panel is portalled, but React
   * still bubbles its events up the COMPONENT tree - into the drawer or modal
   * the picker sits in, which would close as well. A capture listener on the
   * document runs before React's own and stops the key there.
   */
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKey = (event) => {
      if (event.key !== 'Escape' && event.key !== 'Esc') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  /* A press anywhere but the field and the panel closes it - see the top. */
  useEffect(() => {
    if (!isOpen) return undefined;

    const onPress = (event) => {
      const target = event.target;
      if (contentRef.current && contentRef.current.contains(target)) return;
      if (wrapperRef.current && wrapperRef.current.contains(target)) return;
      onClose();
    };

    document.addEventListener('mousedown', onPress, true);
    document.addEventListener('touchstart', onPress, true);
    return () => {
      document.removeEventListener('mousedown', onPress, true);
      document.removeEventListener('touchstart', onPress, true);
    };
  }, [isOpen, onClose]);

  /*
   * FOCUS GOES BACK TO THE FIELD ON CLOSE - unless the member has already
   * put it somewhere else. Chakra does this for a PopoverTrigger, and the
   * field is deliberately NOT one: a trigger has its id replaced with the
   * popover's own, which cuts the <FormLabel for> that finds the field inside
   * a FormControl. So the anchor positions the panel and this hands focus back.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;

    const active = document.activeElement;
    const inPanel = !!contentRef.current && contentRef.current.contains(active);
    if ((!active || active === document.body || inPanel) && buttonRef.current) {
      buttonRef.current.focus({ preventScroll: true });
    }
  }, [isOpen]);

  const pick = (next) => {
    onChange(next);
    onClose();
  };

  const showClear = isClearable !== false && !!value && !disabled;

  /*
   * THE NAME CARRIES THE VALUE. A button labelled "From" is announced as
   * "From" whatever date it holds, so a chosen date is read after the label.
   */
  const named = ariaLabel || t('components.datepicker.chooseADate');
  const label = shown ? t('components.datepicker.valueLabel', { label: named, date: shown }) : named;

  return (
    <Box ref={wrapperRef} position="relative" w="100%" {...rest}>
      <Popover
        isOpen={isOpen && !disabled}
        onOpen={onOpen}
        onClose={onClose}
        placement="bottom-start"
        gutter={6}
        isLazy
        autoFocus={false}
        closeOnBlur={false}
        returnFocusOnClose={false}
        id={field.id}
      >
        <PopoverAnchor>
          <Box
            as="button"
            type="button"
            ref={buttonRef}
            id={field.id}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-controls={isOpen ? 'popover-content-' + field.id : undefined}
            aria-label={label}
            aria-invalid={invalid || undefined}
            aria-required={field['aria-required']}
            aria-describedby={field['aria-describedby']}
            data-value={value || ''}
            onFocus={field.onFocus}
            onBlur={field.onBlur}
            onClick={() => (isOpen ? onClose() : onOpen())}
            onKeyDown={(event) => {
              /* Down opens, as it does on a native date field. */
              if (event.key === 'ArrowDown' && !isOpen) {
                event.preventDefault();
                onOpen();
              }
            }}
            display="flex"
            alignItems="center"
            w="100%"
            h={dims.h}
            pl={dims.px}
            pr={showClear ? '56px' : '36px'}
            textAlign="left"
            fontSize={dims.fontSize}
            bg={fieldBg}
            border="1px solid"
            borderColor={invalid ? 'red.400' : isOpen ? 'brand.500' : fieldBorder}
            borderRadius="8px"
            boxShadow={isOpen ? '0 0 0 1px var(--chakra-colors-brand-500)' : 'none'}
            cursor={disabled ? 'not-allowed' : 'pointer'}
            opacity={disabled ? 0.5 : 1}
            transition="border-color .15s ease, box-shadow .15s ease"
            _hover={{ borderColor: disabled ? fieldBorder : 'brand.400' }}
            _focus={{
              outline: 'none',
              borderColor: 'brand.500',
              boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)'
            }}
          >
            <Text
              as="span"
              noOfLines={1}
              color={shown ? surface.text : surface.muted}
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {shown || placeholder || t('components.datepicker.selectADate')}
            </Text>
          </Box>
        </PopoverAnchor>

        <Portal>
          <PopoverContent
            ref={contentRef}
            /*
             * A focus trap - a drawer's, a modal's - would otherwise pull
             * focus straight back out of a panel portalled outside it.
             */
            data-no-focus-lock
            /*
             * ABOVE the dialog that opened it. Chakra's popper wrapper
             * inherits `z-index: auto` from <body>, under a modal's 1400; a
             * style prop is the half that cannot lose to injection order.
             */
            rootProps={{ zIndex: 1500 }}
            aria-label={t('components.datepicker.chooseADate')}
            w="296px"
            maxW="calc(100vw - 16px)"
            bg={panelBg}
            border="1px solid"
            borderColor={panelBorder}
            borderRadius="12px"
            boxShadow={surface.shadowLifted}
            _focus={{ outline: 'none', boxShadow: surface.shadowLifted }}
            onBlur={(event) => {
              /*
               * TABBING AWAY closes it; focus that simply vanished - a
               * pressed month button replaced by the day grid - does not.
               */
              const next = event.relatedTarget;
              if (!next) return;
              if (contentRef.current && contentRef.current.contains(next)) return;
              if (wrapperRef.current && wrapperRef.current.contains(next)) return;
              onClose();
            }}
          >
            <CalendarPanel
              value={value}
              min={parseISODate(min)}
              max={parseISODate(max)}
              onPick={(day) => pick(toISODate(day))}
              onClear={() => pick('')}
            />
          </PopoverContent>
        </Portal>
      </Popover>

      {/*
        * THE CLEAR BUTTON IS A SIBLING OF THE FIELD, NOT INSIDE IT. The
        * console nests a clickable span in its trigger, which is a button
        * inside a button - a screen reader announces one of the two and a
        * keyboard can reach neither separately.
        */}
      {showClear && (
        <Box
          as="button"
          type="button"
          aria-label={t('common.clear')}
          onClick={() => {
            onChange('');
            onClose();
          }}
          position="absolute"
          top="0"
          bottom="0"
          right="30px"
          my="auto"
          h="22px"
          w="22px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderRadius="6px"
          color={surface.muted}
          _hover={{ color: 'brand.500', bg: surface.hover }}
          _focus={{ outline: 'none', boxShadow: '0 0 0 2px var(--chakra-colors-brand-400)' }}
        >
          <Icon as={CloseIcon} boxSize="8px" />
        </Box>
      )}

      <Icon
        as={CalendarIcon}
        position="absolute"
        top="0"
        bottom="0"
        right="12px"
        my="auto"
        boxSize={dims.icon}
        color={surface.muted}
        pointerEvents="none"
        aria-hidden="true"
      />

      {/* For a plain <form> post, which reads inputs by name. */}
      {name ? <input type="hidden" name={name} value={value || ''} /> : null}
    </Box>
  );
}

/* ------------------------------------------------------------------ */

/**
 * THE PANEL, mounted each time it opens - which is what re-centres it on the
 * current value without an effect to do so. `cursor` is the one piece of
 * state: the day (or month, or year) the keyboard is on, and so also which
 * month the grid shows.
 */
function CalendarPanel({ value, min, max, onPick, onClear }) {
  const { t, intlLocale } = useI18n();
  const surface = useSurface();
  const names = useNames(intlLocale || 'en-GB');

  const hoverBg = useColorModeValue('ink.50', 'ink.600');
  const outsideColor = useColorModeValue('ink.300', 'ink.400');

  const selected = parseISODate(value);
  const today = dayOf(new Date());

  const [view, setView] = useState('days');
  const [cursor, setCursor] = useState(() => nearestInside(selected || today, min, max));

  /*
   * FOCUS FOLLOWS THE CURSOR, but only when the keyboard moved it - or when
   * the panel has just opened. A mouse click on "next month" keeps focus on
   * that arrow, so a second click lands on it too.
   */
  const gridRef = useRef(null);
  const wantFocus = useRef(true);
  const focusFrame = useRef(0);

  /*
   * RETRIED OVER A FEW FRAMES, because the first try can land on nothing.
   * The panel mounts inside Chakra's entry animation, which starts it at
   * `visibility: hidden` - and a hidden element refuses focus without a word.
   * So the cell is asked again each frame until it has focus or ten frames
   * have gone by; the retries are not cancelled by a re-render, only by the
   * panel going away.
   */
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;

    let tries = 0;
    const attempt = () => {
      const node = gridRef.current && gridRef.current.querySelector('[data-cursor="true"]');
      if (!node) return;
      node.focus({ preventScroll: true });
      if (document.activeElement !== node && tries < 10) {
        tries += 1;
        focusFrame.current = window.requestAnimationFrame(attempt);
      }
    };
    window.cancelAnimationFrame(focusFrame.current);
    attempt();
  });

  useEffect(() => () => window.cancelAnimationFrame(focusFrame.current), []);

  const moveTo = (next, byKeyboard) => {
    wantFocus.current = !!byKeyboard;
    setCursor(next);
  };

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const blockStart = Math.floor(year / YEAR_PAGE) * YEAR_PAGE;

  /* What the arrows step by, and whether a step leads anywhere pickable. */
  const step = (direction) => {
    if (view === 'days') return addMonths(cursor, direction);
    if (view === 'months') return addMonths(cursor, direction * 12);
    return addMonths(cursor, direction * 12 * YEAR_PAGE);
  };

  const stepDead = (direction) => {
    const next = step(direction);
    if (view === 'days') return monthOutside(next.getFullYear(), next.getMonth(), min, max);
    if (view === 'months') return yearOutside(next.getFullYear(), min, max);
    const start = Math.floor(next.getFullYear() / YEAR_PAGE) * YEAR_PAGE;
    return outside(new Date(start, 0, 1), new Date(start + YEAR_PAGE - 1, 11, 31), min, max);
  };

  const stepLabel = (direction) => {
    if (view === 'days') return t(direction < 0 ? 'components.datepicker.previousMonth' : 'components.datepicker.nextMonth');
    if (view === 'months') return t(direction < 0 ? 'components.datepicker.previousYear' : 'components.datepicker.nextYear');
    return t(direction < 0 ? 'components.datepicker.earlierYears' : 'components.datepicker.laterYears');
  };

  const caption = view === 'days'
    ? names.monthCaption.format(cursor)
    : view === 'months'
      ? String(year)
      : blockStart + ' – ' + (blockStart + YEAR_PAGE - 1);

  const captionLabel = view === 'days'
    ? t('components.datepicker.chooseMonth', { period: caption })
    : view === 'months'
      ? t('components.datepicker.chooseYear', { period: caption })
      : t('components.datepicker.backToDays', { period: caption });

  /* Days to the months, months to the years, years back to the days. */
  const cycleView = () => {
    setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days');
  };

  /** One key, one move - per view, since a "row" is a week, a quarter or four years. */
  const onGridKey = (event) => {
    const key = event.key;
    let next = null;

    if (view === 'days') {
      if (key === 'ArrowLeft') next = addDays(cursor, -1);
      else if (key === 'ArrowRight') next = addDays(cursor, 1);
      else if (key === 'ArrowUp') next = addDays(cursor, -7);
      else if (key === 'ArrowDown') next = addDays(cursor, 7);
      else if (key === 'Home') next = addDays(cursor, -((cursor.getDay() - WEEK_STARTS_ON + 7) % 7));
      else if (key === 'End') next = addDays(cursor, 6 - ((cursor.getDay() - WEEK_STARTS_ON + 7) % 7));
      else if (key === 'PageUp') next = addMonths(cursor, event.shiftKey ? -12 : -1);
      else if (key === 'PageDown') next = addMonths(cursor, event.shiftKey ? 12 : 1);
    } else if (view === 'months') {
      if (key === 'ArrowLeft') next = addMonths(cursor, -1);
      else if (key === 'ArrowRight') next = addMonths(cursor, 1);
      else if (key === 'ArrowUp') next = addMonths(cursor, -3);
      else if (key === 'ArrowDown') next = addMonths(cursor, 3);
      else if (key === 'PageUp') next = addMonths(cursor, -12);
      else if (key === 'PageDown') next = addMonths(cursor, 12);
    } else {
      if (key === 'ArrowLeft') next = addMonths(cursor, -12);
      else if (key === 'ArrowRight') next = addMonths(cursor, 12);
      else if (key === 'ArrowUp') next = addMonths(cursor, -48);
      else if (key === 'ArrowDown') next = addMonths(cursor, 48);
      else if (key === 'PageUp') next = addMonths(cursor, -12 * YEAR_PAGE);
      else if (key === 'PageDown') next = addMonths(cursor, 12 * YEAR_PAGE);
    }

    if (!next) return;
    event.preventDefault();
    moveTo(next, true);
  };

  /* Drilling in by keyboard or pointer lands focus on the new view's cursor. */
  const drillTo = (nextView, nextCursor) => {
    wantFocus.current = true;
    setView(nextView);
    setCursor(nearestInside(nextCursor, min, max));
  };

  const cellBase = {
    as: 'button',
    type: 'button',
    align: 'center',
    justify: 'center',
    borderRadius: '8px',
    fontSize: 'sm',
    transition: 'background .12s ease',
    _focus: { outline: 'none', boxShadow: '0 0 0 2px var(--chakra-colors-brand-400)' }
  };

  const cellLook = (isSelected, isDisabled) => ({
    bg: isSelected ? 'brand.500' : 'transparent',
    color: isSelected ? 'white' : surface.text,
    fontWeight: isSelected ? '700' : '500',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.35 : 1,
    _hover: { bg: isDisabled ? 'transparent' : isSelected ? 'brand.600' : hoverBg }
  });

  const todayOut = dayOutside(today, min, max);

  return (
    <Box p="3">
      <Flex align="center" justify="space-between" mb="2" gap="2" data-gap="8">
        {[-1, 1].map((direction) => {
          const dead = stepDead(direction);
          const arrow = (
            <Button
              key={direction}
              data-step={direction}
              aria-label={stepLabel(direction)}
              variant="quiet"
              size="sm"
              minW="32px"
              w="32px"
              h="32px"
              p="0"
              isDisabled={dead}
              onClick={() => moveTo(step(direction), false)}
            >
              <Icon as={direction < 0 ? ChevronLeftIcon : ChevronRightIcon} boxSize="18px" />
            </Button>
          );

          if (direction < 0) return arrow;

          return (
            <React.Fragment key="caption-and-next">
              <Button
                variant="ghost"
                size="sm"
                flex="1"
                h="32px"
                fontSize="sm"
                fontWeight="700"
                color={surface.text}
                _hover={{ bg: hoverBg }}
                data-caption
                aria-label={captionLabel}
                aria-live="polite"
                onClick={cycleView}
              >
                {caption}
              </Button>
              {arrow}
            </React.Fragment>
          );
        })}
      </Flex>

      <Box ref={gridRef} onKeyDown={onGridKey}>
        {view === 'days' && (
          <>
            <Grid templateColumns="repeat(7, 1fr)" gap="2px" mb="1" aria-hidden="true">
              {names.weekdays.map((entry) => (
                <Text
                  key={entry.day}
                  textAlign="center"
                  py="1"
                  fontSize="xs"
                  fontWeight="700"
                  color={entry.day === 0 || entry.day === 6 ? 'red.400' : surface.muted}
                >
                  {entry.label}
                </Text>
              ))}
            </Grid>

            <Grid templateColumns="repeat(7, 1fr)" gap="2px">
              {weeksOf(year, month).map((day) => {
                const iso = toISODate(day);
                const isSelected = sameDay(day, selected);
                const isToday = sameDay(day, today);
                const isOut = dayOutside(day, min, max);
                const inMonth = day.getMonth() === month;
                const isCursor = sameDay(day, cursor);

                return (
                  <Flex
                    key={iso}
                    {...cellBase}
                    {...cellLook(isSelected, isOut)}
                    h="34px"
                    data-date={iso}
                    data-cursor={isCursor ? 'true' : undefined}
                    tabIndex={isCursor ? 0 : -1}
                    aria-label={names.spoken.format(day)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-disabled={isOut || undefined}
                    border="1px solid"
                    borderColor={isToday && !isSelected ? 'brand.500' : 'transparent'}
                    color={isSelected ? 'white' : inMonth ? surface.text : outsideColor}
                    fontWeight={isSelected || isToday ? '700' : '500'}
                    onClick={() => {
                      if (isOut) return;
                      onPick(day);
                    }}
                  >
                    {day.getDate()}
                  </Flex>
                );
              })}
            </Grid>
          </>
        )}

        {view === 'months' && (
          <Grid templateColumns="repeat(3, 1fr)" gap="6px">
            {names.months.map((label, index) => {
              const isSelected = !!selected && selected.getFullYear() === year && selected.getMonth() === index;
              const isOut = monthOutside(year, index, min, max);
              const isCursor = month === index;

              return (
                <Flex
                  key={index}
                  {...cellBase}
                  {...cellLook(isSelected, isOut)}
                  h="44px"
                  data-month={index + 1}
                  data-cursor={isCursor ? 'true' : undefined}
                  tabIndex={isCursor ? 0 : -1}
                  aria-label={names.monthLong.format(new Date(year, index, 1))}
                  aria-pressed={isSelected}
                  aria-disabled={isOut || undefined}
                  onClick={() => {
                    if (isOut) return;
                    drillTo('days', new Date(year, index, Math.min(cursor.getDate(), new Date(year, index + 1, 0).getDate())));
                  }}
                >
                  {label}
                </Flex>
              );
            })}
          </Grid>
        )}

        {view === 'years' && (
          <Grid templateColumns="repeat(4, 1fr)" gap="6px">
            {Array.from({ length: YEAR_PAGE }).map((ignored, index) => {
              const candidate = blockStart + index;
              const isSelected = !!selected && selected.getFullYear() === candidate;
              const isOut = yearOutside(candidate, min, max);
              const isCursor = year === candidate;

              return (
                <Flex
                  key={candidate}
                  {...cellBase}
                  {...cellLook(isSelected, isOut)}
                  h="38px"
                  data-year={candidate}
                  data-cursor={isCursor ? 'true' : undefined}
                  tabIndex={isCursor ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-disabled={isOut || undefined}
                  onClick={() => {
                    if (isOut) return;
                    drillTo('months', addMonths(cursor, (candidate - year) * 12));
                  }}
                >
                  {candidate}
                </Flex>
              );
            })}
          </Grid>
        )}
      </Box>

      <Flex justify="space-between" align="center" mt="3" gap="2" data-gap="8">
        <Button
          size="xs"
          variant="quiet"
          data-today
          isDisabled={todayOut}
          onClick={() => onPick(today)}
        >
          {t('components.datepicker.today')}
        </Button>
        <Button size="xs" variant="quiet" isDisabled={!value} onClick={onClear}>
          {t('common.clear')}
        </Button>
      </Flex>
    </Box>
  );
}
