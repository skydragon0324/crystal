import React, { useEffect, useState } from 'react';
import {
  Flex, Text, Input, Button, Icon, Tooltip, useBreakpointValue, useColorModeValue
} from '@chakra-ui/react';
import {
  ChevronLeftIcon, ChevronRightIcon, ArrowLeftIcon, ArrowRightIcon
} from '@chakra-ui/icons';
import SelectField from './SelectField';
import { useI18n } from '../i18n';

export const PAGE_SIZES = [10, 20, 50, 100];

/** Ten rows is what most of these screens are read at, so start there. */
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/** Pages shown either side of the current one before an ellipsis takes over. */
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
 * Narrow screens get a different footer rather than a squeezed version of this
 * one.  A numbered strip needs roughly 400px before it starts wrapping into an
 * unreadable block, and on a phone the numbers are not worth that space: nobody
 * jumps to page 14 of a list they are scrolling through with a thumb.  So the
 * strip, the jump box and the first/last arrows all drop out, leaving the two
 * controls that actually get used - prev and next - pushed to the edges where
 * they are easiest to reach, with the position shown between them.  This is
 * what Polaris, Material and GitHub all settle on at this width.
 *
 * `showGoto` hides the jump-to-page box and its Go button on screens where the
 * page strip alone is enough.  It is already hidden on narrow screens.
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
          <Text
            fontSize="sm" color={textColor} fontWeight="700"
            whiteSpace="nowrap" userSelect="none"
          >
            {t('pagination.pageOf', { page: current, count: pageCount })}
          </Text>
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
            <Button
              variant="subtle" size="sm" h="2.25rem" borderRadius="0.75rem" display="none"
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

