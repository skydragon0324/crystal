import React, { useEffect, useState } from 'react';
import {
  Flex, Text, Input, Button, Icon, Tooltip, useBreakpointValue, useColorModeValue
} from '@chakra-ui/react';
import {
  ChevronLeftIcon, ChevronRightIcon, ArrowLeftIcon, ArrowRightIcon
} from '@chakra-ui/icons';
import SelectField from './SelectField';
import { useI18n } from '../i18n';

/**
 * What the select offers, and the API is the reason the list stops at 100.
 *
 * utils/query.js clamps ?limit= to 200, so anything above that would be a
 * choice the server silently ignores - a reader who picked 500 and got 200
 * rows has no way to tell whether the rest exist. 100 leaves headroom and is
 * already more rows than anybody reads in one screen.
 */
export const PAGE_SIZES = [10, 20, 50, 100];

/** Ten rows is what most of these screens are read at, so start there. */
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/**
 * Pages shown either side of the current one before an ellipsis takes over.
 *
 * ONE. On page 8 of 20 the strip is `1 … 7 8 9 … 20` and not `6 7 8 9 10`:
 * the extra pair is two more buttons that look like the others and answer
 * nothing, and the go-to box below is the honest way to reach page 14.
 */
const DEFAULT_SIBLINGS = 1;

/** Pages pinned at each end of the strip. */
const BOUNDARIES = 1;

const range = (from, to) => {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
};

/**
 * Builds the classic 1 … 4 [5] 6 … 20 strip.
 * Returns numbers and the strings 'gap-left' / 'gap-right'.
 */
export function buildPageItems(current, pageCount, siblings) {
  const side = siblings === undefined ? DEFAULT_SIBLINGS : siblings;

  // Boundaries + current + siblings + the two gaps.
  const slots = BOUNDARIES * 2 + side * 2 + 3;
  if (pageCount <= slots) return range(1, pageCount);

  const left = Math.max(current - side, BOUNDARIES + 2);
  const right = Math.min(current + side, pageCount - BOUNDARIES - 1);

  const showLeftGap = left > BOUNDARIES + 2;
  const showRightGap = right < pageCount - BOUNDARIES - 1;

  // Length of the unbroken run shown when the current page sits at one end.
  // Deliberately short - "1 2 3 … 40" scans faster than "1 2 3 4 5 6 … 40" -
  // but never so short that it would cut off the current page or its siblings.
  const edgeRun = BOUNDARIES + side * 2;

  if (!showLeftGap && showRightGap) {
    return range(1, Math.max(edgeRun, right))
      .concat(['gap-right'], range(pageCount - BOUNDARIES + 1, pageCount));
  }

  if (showLeftGap && !showRightGap) {
    return range(1, BOUNDARIES)
      .concat(['gap-left'], range(Math.min(pageCount - edgeRun + 1, left), pageCount));
  }

  return range(1, BOUNDARIES)
    .concat(['gap-left'], range(left, right), ['gap-right'], range(pageCount - BOUNDARIES + 1, pageCount));
}

/**
 * Table footer: row count, page size select, numbered page strip, go-to-page
 * box and first/prev/next/last arrows.  Fully controlled by the parent.
 *
 * ONE NEIGHBOUR EITHER SIDE, and no more - see DEFAULT_SIBLINGS.  On page 8
 * of 20 that is `1 … 7 8 9 … 20`.  Two neighbours reads as a longer row of
 * near-identical numbers without answering a question the first one did not:
 * somebody who wants page 12 is going to type it, not count six buttons
 * along.  That is what the go-to box is for, and it is why the box is not an
 * optional extra on a table with many pages.
 *
 * Narrow screens get a different footer rather than a squeezed version of this
 * one.  A numbered strip needs roughly 400px before it starts wrapping into an
 * unreadable block, and on a phone the numbers are not worth that space: a row
 * of eight 36px buttons is a wrapping block that is hard to hit and hard to
 * read.  So the strip and the first/last arrows drop out, leaving prev and
 * next pushed to the edges where a thumb reaches them - and between them the
 * position itself becomes the jump control, because THAT is the part a phone
 * cannot afford to lose.  Tapping "3" of "3 / 12" selects it, a number types
 * over it and the keyboard's Go key moves.  One tap target instead of nine.
 *
 * `showGoto={false}` drops the jump control on a screen where the strip alone
 * is enough - a list that is never more than two or three pages.  It is the
 * exception rather than the default, on both widths.
 */
export default function Pagination({
  page, limit, total, onPageChange, onLimitChange, onPage, onLimit,
  pageSizes, siblings, showGoto
}) {
  const { t } = useI18n();

  /*
   * `onPage`/`onLimit` are what the screens in this console were written
   * against; `onPageChange`/`onLimitChange` are what the component library
   * arrived using.  Accepting both was cheaper - and less risky - than
   * editing six screens to rename a callback.
   */
  const changePage = onPageChange || onPage || function () {};
  const changeLimit = onLimitChange || onLimit || function () {};
  const isNarrow = useBreakpointValue({ base: true, md: false });

  const mutedColor = useColorModeValue('secondaryGray.600', 'secondaryGray.500');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.200');
  const arrowBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.100');
  const brandColor = useColorModeValue('brand.500', 'brand.400');

  const safeLimit = limit || DEFAULT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil((total || 0) / safeLimit));
  const current = Math.min(Math.max(1, page || 1), pageCount);
  const from = total ? (current - 1) * safeLimit + 1 : 0;
  const to = Math.min(current * safeLimit, total || 0);

  const [goto, setGoto] = useState('');
  useEffect(() => { setGoto(''); }, [current, safeLimit]);

  const sizeOptions = (pageSizes || PAGE_SIZES).map((n) => ({ value: n, label: String(n) }));
  const items = buildPageItems(current, pageCount, siblings);

  const jump = () => {
    const target = Number(goto);
    if (!goto || isNaN(target)) return;
    changePage(Math.min(Math.max(1, Math.round(target)), pageCount));
    setGoto('');
  };

  /*
   * Bigger hit area on touch screens, where 36px is below what a thumb
   * reliably lands on.
   *
   * The label is shown through a Tooltip rather than the browser's own
   * title attribute: that one cannot be styled, ignores the colour mode,
   * and takes about a second to appear.  aria-label stays either way -
   * the tooltip is a sighted reader's version of the same thing, not a
   * replacement for it.
   *
   * A disabled Chakra button stops firing the events a tooltip listens
   * for, so the wrapper is told to keep listening; without it the arrow
   * at the end of the list silently loses its label.
   */
  const arrow = (label, icon, targetPage, disabled) => (
    <Tooltip label={label} openDelay={300} placement="top" hasArrow shouldWrapChildren={disabled}>
      <Button
        aria-label={label}
        variant="no-hover" bg={arrowBg} borderRadius="0.75rem"
        w={{ base: '2.75rem', md: '2.25rem' }}
        h={{ base: '2.75rem', md: '2.25rem' }}
        minW={{ base: '2.75rem', md: '2.25rem' }}
        p="0"
        isDisabled={disabled}
        onClick={() => changePage(targetPage)}
      >
        <Icon as={icon} w="0.75rem" h="0.75rem" color={mutedColor} />
      </Button>
    </Tooltip>
  );

  // The full sentence wraps to two lines on a phone, so narrow screens get
  // the same information in the space of one.
  const countKey = isNarrow ? '{from}-{to} of {total}' : 'Showing {from} to {to} of {total} entries';
  const countText = total ? t(countKey, { from, to, total }) : t('table.noEntries');

  const sizeSelect = (
    <SelectField
      size="sm" w="5.375rem"
      options={sizeOptions}
      value={safeLimit}
      isClearable={false}
      isSearchable={false}
      aria-label={t('pagination.rowsPerPage')}
      onChange={(next) => changeLimit(Number(next))}
    />
  );

  if (isNarrow) {
    return (
      <Flex direction="column" px="0.625rem" pt="0.625rem" gap="0.75rem" data-gap="12" data-gap-column>
        <Flex align="center" justify="space-between" gap="0.75rem" data-gap="12">
          <Text fontSize="sm" color={mutedColor} fontWeight="500">
            {countText}
          </Text>
          {sizeSelect}
        </Flex>

        <Flex align="center" justify="space-between" gap="0.75rem" data-gap="12">
          {arrow(t('pagination.previousPage'), ChevronLeftIcon, current - 1, current <= 1)}

          {showGoto === false || pageCount < 2 ? (
            <Text
              fontSize="sm" color={textColor} fontWeight="700"
              whiteSpace="nowrap" userSelect="none"
            >
              {t('pagination.pageOf', { page: current, count: pageCount })}
            </Text>
          ) : (
            /*
             * THE POSITION IS THE JUMP CONTROL on a phone.
             *
             * A separate box and Go button would be a second row of chrome
             * under a list somebody is reading with one hand, so the number
             * that was already there is simply made editable: it shows the
             * page you are on until you type over it, and the on-screen
             * keyboard's own Go key does the moving.  `inputMode="numeric"`
             * is what puts a digit pad under it rather than a QWERTY.
             *
             * It commits on blur as well as on Enter, because dismissing the
             * keyboard is what people do instead of pressing Go, and a
             * typed number that quietly does nothing is worse than no box.
             */
            <Flex align="center" gap="0.375rem" data-gap="6">
              <Input
                size="sm" w="3.25rem" h="2.75rem" borderRadius="0.75rem"
                textAlign="center" fontSize="sm" fontWeight="700"
                color={textColor} borderColor={borderColor}
                type="number" inputMode="numeric" min="1" max={pageCount}
                aria-label={t('pagination.goToPage')}
                value={goto === '' ? String(current) : goto}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setGoto(e.target.value)}
                onBlur={jump}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
              />
              {/*
                * A SLASH RATHER THAN A WORD, and not because "of" is hard to
                * translate: it is the one piece of this footer that has to
                * survive at 320px beside a text box and two 44px buttons.
                * "3 / 12" is read the same way in all three languages, and a
                * screen reader is told the range by the spin button's own
                * min and max rather than by these two characters.
                */}
              <Text
                fontSize="sm" color={mutedColor} fontWeight="500"
                whiteSpace="nowrap" userSelect="none"
              >
                {'/ ' + pageCount}
              </Text>
            </Flex>
          )}

          {arrow(t('pagination.nextPage'), ChevronRightIcon, current + 1, current >= pageCount)}
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex
      justify="space-between" align="center"
      px="0.625rem" pt="0.625rem" wrap="wrap" gap="0.875rem" data-gap="14" data-gap-wrap
    >
      <Flex align="center" gap="0.75rem" data-gap="12" data-gap-wrap wrap="wrap">
        <Text fontSize="sm" color={mutedColor} fontWeight="500">
          {countText}
        </Text>

        <Flex align="center" gap="0.5rem" data-gap="8">
          <Text fontSize="sm" color={mutedColor} fontWeight="500" whiteSpace="nowrap">
            {t('pagination.rowsPerPage')}
          </Text>
          {sizeSelect}
        </Flex>
      </Flex>

      <Flex align="center" gap="0.625rem" data-gap="10" data-gap-wrap wrap="wrap">
        {showGoto === false ? null : (
          <Flex align="center" gap="0.375rem" data-gap="6">
            <Input
              size="sm" w="4.5rem" h="2.25rem" borderRadius="0.75rem" fontSize="sm"
              textAlign="center" color={textColor} borderColor={borderColor}
              type="number" min="1" max={pageCount}
              aria-label={t('pagination.goToPage')}
              placeholder={t('pagination.goToPage')}
              _placeholder={{ fontSize: '0.6875rem' }}
              value={goto}
              onChange={(e) => setGoto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); jump(); } }}
            />
            {/*
              * VISIBLE. This button was `display: none`, which left Enter as
              * the only way to act on the box - and a text box with no button
              * beside it reads as a filter, not as a jump. People typed a
              * number into it, saw nothing happen, and went back to counting
              * along the strip.
              */}
            <Button
              variant="subtle" size="sm" h="2.25rem" borderRadius="0.75rem"
              fontSize="xs" px="0.875rem" onClick={jump} isDisabled={!goto}
            >
              {t('pagination.go')}
            </Button>
          </Flex>
        )}

        <Flex align="center" gap="0.375rem" data-gap="6">
          {arrow(t('pagination.firstPage'), ArrowLeftIcon, 1, current <= 1)}
          {arrow(t('pagination.previousPage'), ChevronLeftIcon, current - 1, current <= 1)}

          {items.map((item) => {
            if (typeof item !== 'number') {
              return (
                <Flex
                  key={item} w="1.75rem" h="2.25rem" align="flex-end" justify="center"
                  color={mutedColor} fontSize="sm" fontWeight="700" userSelect="none"
                >
                  &hellip;
                </Flex>
              );
            }

            const active = item === current;
            return (
              <Button
                key={item}
                aria-label={t('pagination.pageNumber', { number: item })}
                aria-current={active ? 'page' : undefined}
                variant="no-hover"
                bg={active ? brandColor : 'transparent'}
                border={active ? 'none' : '1px solid'}
                borderColor={borderColor}
                color={active ? 'white' : mutedColor}
                _hover={active ? {} : { borderColor: brandColor, color: textColor }}
                borderRadius="0.75rem" w="2.25rem" h="2.25rem" minW="2.25rem" p="0"
                fontSize="sm" fontWeight="700"
                onClick={() => (active ? null : changePage(item))}
              >
                {item}
              </Button>
            );
          })}

          {arrow(t('pagination.nextPage'), ChevronRightIcon, current + 1, current >= pageCount)}
          {arrow(t('pagination.lastPage'), ArrowRightIcon, pageCount, current >= pageCount)}
        </Flex>
      </Flex>
    </Flex>
  );
}

