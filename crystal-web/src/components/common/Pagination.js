import React, { useEffect, useState } from 'react';
import { Button, Flex, HStack, IconButton, Input, Select, Text } from '@chakra-ui/react';
import { ArrowForwardIcon, ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import { number } from '@/utils/format';

/**
 * Page controls.
 *
 * PROPS
 *
 *   meta       { page, limit, total, totalPages } - what useList hands back.
 *   onPage     (page) => void        required.
 *   onLimit    (limit) => void       optional. Given, the rows-per-page
 *                                    select appears; omitted, it does not,
 *                                    which is how a list whose size is fixed
 *                                    by the page (a three-up strip) opts out
 *                                    without passing a flag.
 *   pageSizes  [10, 20, 50, 100]     optional, the select's choices.
 *   siblings   1                     optional, numbered buttons either side
 *                                    of the current page.
 *
 * ONE NEIGHBOUR EITHER SIDE, so five buttons at most: first, previous,
 * current, next, last. It used to be a window of five NUMBERS plus the two
 * ends, which on page 8 of 20 drew 1 … 6 7 [8] 9 10 … 20 - eight targets, of
 * which six say "somewhere near where you already are". Nobody navigates a
 * list by stepping to page 10; they step by one, or they jump. So the strip
 * shows the step and the ends, and JUMPING IS A BOX YOU TYPE IN rather than
 * a button that happens to exist.
 *
 * THE PHONE GETS A DIFFERENT CONTROL, not the same one wrapped. A numbered
 * strip plus a select plus a jump box is four lines of chrome under a list on
 * a 360px screen, and the wrap order puts them in a different arrangement at
 * every width. So below md the strip and the count come out and what is left
 * is one row that fits: the size select on the left, and `‹ [8] / 20 ›` on
 * the right - where the box between the arrows is the SAME jump box, doing
 * double duty as the page indicator. Everything is still reachable and
 * nothing moves as the list changes length.
 *
 * THE JUMP BOX IS NOT CONTROLLED BY THE PAGE. It follows `meta.page` when the
 * page changes underneath it, but while somebody is typing "12" it has to be
 * allowed to hold "1" for a keystroke without the list jumping to page 1.
 * That is what the local state and the commit-on-Enter/blur are for.
 */

/** What a list can be asked to show at once. */
export const PAGE_SIZES = [10, 20, 50, 100];

/**
 * The numbered buttons around the current page.
 *
 * Exported because it is the one piece of this with a right and a wrong
 * answer, and a test can ask it directly rather than mounting a component.
 */
export function pageWindow(page, totalPages, siblings) {
  const span = (siblings === undefined ? 1 : siblings) * 2 + 1;

  let start = Math.max(1, page - Math.floor(span / 2));
  const end = Math.min(totalPages, start + span - 1);
  start = Math.max(1, end - span + 1);

  const pages = [];
  for (let index = start; index <= end; index += 1) pages.push(index);
  return pages;
}

export default function Pagination({ meta, onPage, onLimit, pageSizes, siblings }) {
  const t = useT();
  const surface = useSurface();

  const page = (meta && meta.page) || 1;
  const totalPages = (meta && meta.totalPages) || 1;

  /* What is in the jump box right now, which is not always the page. */
  const [jump, setJump] = useState(String(page));

  useEffect(() => {
    setJump(String(page));
  }, [page]);

  const sizes = pageSizes || PAGE_SIZES;
  const total = (meta && meta.total) || 0;

  /*
   * WHEN THERE IS NOTHING TO PAGE, there is still sometimes something to
   * choose. One page of 100 rows is one page only because the reader asked
   * for 100 at a time, and hiding the select at that moment leaves them no
   * way back to 10.
   */
  const pageable = totalPages > 1;
  const resizable = !!onLimit && (pageable || total > sizes[0]);
  if (!meta || (!pageable && !resizable)) return null;

  const pages = pageWindow(page, totalPages, siblings);
  const start = pages[0];
  const end = pages[pages.length - 1];

  const go = (next) => {
    const wanted = Math.min(Math.max(1, Math.round(Number(next) || 1)), totalPages);
    if (wanted !== page) onPage(wanted);
    setJump(String(wanted));
  };

  /*
   * React 16 pools synthetic events, so the value is read into a local
   * BEFORE anything asynchronous happens with it - see eventPooling.test.js.
   */
  const onJumpChange = (event) => {
    const value = event.target.value;
    setJump(value);
  };

  const onJumpKey = (event) => {
    if (event.key !== 'Enter') return;
    const value = event.currentTarget.value;
    event.preventDefault();
    go(value);
  };

  const onSize = (event) => {
    const value = Number(event.target.value);
    onLimit(value);
  };

  /** The jump box, drawn twice - once inside the phone row, once beside the strip. */
  const jumpInput = (
    <Input
      size="sm"
      w="56px"
      textAlign="center"
      /*
       * `inputMode` rather than type="number", so a phone raises the digit
       * keypad without the desktop growing a pair of spinners that are
       * 12px tall and impossible to hit.
       */
      inputMode="numeric"
      aria-label={t('pagination.goToPage')}
      value={jump}
      onChange={onJumpChange}
      onKeyDown={onJumpKey}
      onBlur={() => go(jump)}
    />
  );

  return (
    <Flex
      mt="8"
      align="center"
      justify="space-between"
      gap="3"
      data-gap="12"
      data-gap-wrap
      wrap="wrap"
    >
      {/* --------------------------------------------- rows per page + count */}
      <Flex align="center" flexShrink={0}>
        {resizable && (
          <>
            <Text
              display={{ base: 'none', md: 'block' }}
              fontSize="sm"
              color={surface.muted}
              mr="2"
            >
              {t('pagination.rowsPerPage')}
            </Text>
            <Select
              size="sm"
              w="76px"
              borderRadius="8px"
              aria-label={t('pagination.rowsPerPage')}
              value={String((meta && meta.limit) || sizes[0])}
              onChange={onSize}
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </>
        )}

        <Text
          display={{ base: 'none', md: 'block' }}
          fontSize="sm"
          color={surface.muted}
          ml={resizable ? '4' : '0'}
        >
          {t('pagination.results', { count: number(total) })}
        </Text>
      </Flex>

      {/* ------------------------------------------------------------- pager */}
      {pageable && (
        <Flex align="center" flexShrink={0}>
          <IconButton
            size="sm"
            variant="quiet"
            aria-label={t('pagination.previousPage')}
            icon={<ChevronLeftIcon />}
            isDisabled={page <= 1}
            onClick={() => go(page - 1)}
          />

          {/* The numbered strip - desktop only. */}
          <HStack spacing="1" mx="1" display={{ base: 'none', md: 'flex' }}>
            {start > 1 && (
              <Button size="sm" variant="quiet" onClick={() => go(1)}>
                1
              </Button>
            )}
            {start > 2 && (
              <Text px="1" color={surface.muted}>
                …
              </Text>
            )}
            {pages.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={value === page ? 'brand' : 'quiet'}
                aria-current={value === page ? 'page' : undefined}
                onClick={() => go(value)}
              >
                {value}
              </Button>
            ))}
            {end < totalPages - 1 && (
              <Text px="1" color={surface.muted}>
                …
              </Text>
            )}
            {end < totalPages && (
              <Button size="sm" variant="quiet" onClick={() => go(totalPages)}>
                {totalPages}
              </Button>
            )}
          </HStack>

          {/* The phone's indicator, which is the jump box with the total beside it. */}
          <Flex align="center" mx="2" display={{ base: 'flex', md: 'none' }}>
            {jumpInput}
            <Text fontSize="sm" color={surface.muted} ml="2" whiteSpace="nowrap">
              / {totalPages}
            </Text>
          </Flex>

          <IconButton
            size="sm"
            variant="quiet"
            aria-label={t('pagination.nextPage')}
            icon={<ChevronRightIcon />}
            isDisabled={page >= totalPages}
            onClick={() => go(page + 1)}
          />

          {/* Go to N - desktop only; the phone's copy is the indicator above. */}
          <Flex align="center" ml="4" display={{ base: 'none', md: 'flex' }}>
            <Text fontSize="sm" color={surface.muted} mr="2" whiteSpace="nowrap">
              {t('pagination.goTo')}
            </Text>
            {jumpInput}
            <IconButton
              size="sm"
              variant="quiet"
              ml="1"
              aria-label={t('pagination.goToPage')}
              icon={<ArrowForwardIcon />}
              onClick={() => go(jump)}
            />
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
