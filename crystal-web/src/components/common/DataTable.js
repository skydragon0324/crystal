import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Skeleton,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import EmptyState from './EmptyState';
import Pagination from './Pagination';

/**
 * The account area's table.
 *
 * A COLUMN IS:
 *
 *   {
 *     key,                  unique; also the field read when there is no render
 *     label,                a t() address, or English the catalogue can match
 *     render(row, number),  what belongs in the cell
 *     sortKey,              names an API field; omit to make the column unsortable
 *     align,                'left' (default) | 'right' | 'center'
 *     width,                STARTING width - 120 or '120px'. Any other CSS
 *                           length still styles the first paint, and is then
 *                           replaced by what that paint measured
 *     minWidth,             px floor when dragging. The default is 72, or the
 *                           column's own starting width where that is narrower
 *     resizable,            false to take the drag handle off this one column
 *     pin,                  'left' | 'right' - freeze it against that edge
 *     hideOnCard            leave it out of the phone card
 *   }
 *
 * `render(row, number)` gets the row's position in the WHOLE list, not on
 * this page: a numbered column that restarts at 1 on page two is worse than
 * no numbers at all, and working it out needs the page and the page size,
 * which the table has and a column does not.
 *
 * Sorting is SERVER-side - `sortKey` names an API field, because the table
 * holds one page and sorting twenty of two hundred rows is a lie.
 *
 * TWO COLUMNS PER SIDE, AND THE THIRD IS NOT AN ERROR. `pin` is honoured for
 * the first two `'left'` and the last two `'right'`; any beyond that are
 * drawn as ordinary columns rather than refused. A table that freezes half
 * of itself has no room left to scroll, and failing loudly over a column
 * somebody pinned by accident would take a working screen down with it.
 *
 * PINNED COLUMNS MOVE TO THE EDGES of the row, whatever order they are
 * declared in. This is not tidiness: `position: sticky` parks a cell at the
 * edge of the scroller but leaves its slot where it was, so a pinned column
 * declared third would sit on top of the first two AND leave a gap in the
 * middle. Reordering is what makes freezing mean anything.
 *
 * WIDTHS ARE MEASURED BEFORE THEY ARE SET. The table lays out normally on
 * first paint, every header is measured, and only then does it switch to
 * `table-layout: fixed` with those widths in a <colgroup>. Declaring widths
 * up front would mean guessing them, and the guess is wrong for every
 * language the site is translated into; measuring means a Russian column
 * header sizes itself in Russian. The colgroup is also why the header stays
 * aligned with the body: there is ONE table, and one set of column widths,
 * so there is nothing for them to drift apart from.
 *
 * A PINNED CELL IS OPAQUE, in both colour modes, and `pinnedBg` says what it
 * is opaque WITH. It defaults to the page ground, which is what these tables
 * sit on; a table inside a tinted band has to say so, because a frozen cell
 * that is even slightly transparent shows the scrolled rows travelling
 * underneath it and is unreadable the moment anything moves.
 *
 * Below `md` the rows become cards, and neither pinning nor resizing applies
 * there. That is a PHONE treatment, not a narrow-window one: a six-column
 * transaction table cannot be read on a phone however it scrolls.
 */

/** Nothing may be dragged narrower than this - a column of ellipses is not a column. */
const MIN_WIDTH = 72;

/** How many columns may be frozen against one edge. See the note above. */
const MAX_PINNED = 2;

/** One arrow-key press moves an edge this far. */
const KEY_STEP = 16;

/**
 * A column's declared width as a NUMBER of pixels, or 0 for "it did not say".
 *
 * Columns were already declaring `width: '56px'` before any of this existed,
 * and a string is worth nothing to the arithmetic that positions a frozen
 * column - so both spellings are read here rather than every call site being
 * rewritten. Anything else (a percentage, an em) measures instead: it will
 * have styled the first paint, and the first paint is what gets measured.
 */
function pxOf(value) {
  if (typeof value === 'number') return isFinite(value) && value > 0 ? value : 0;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(String(value || '').trim());
  return match ? Number(match[1]) : 0;
}

/**
 * The columns in the order they are DRAWN, and which ones actually froze.
 *
 * Exported because it is the one piece of the pinning with a right and a
 * wrong answer - the two-per-side cap and the pull to the edges - and a test
 * can ask it directly instead of mounting a table into a jsdom that has no
 * layout to measure.
 */
export function orderColumns(columns) {
  const all = (columns || []).filter(Boolean);
  const left = all.filter((column) => column.pin === 'left').slice(0, MAX_PINNED);
  const right = all.filter((column) => column.pin === 'right').slice(-MAX_PINNED);
  const frozen = left.concat(right);
  const middle = all.filter((column) => frozen.indexOf(column) === -1);

  return { list: left.concat(middle, right), left: left, right: right };
}

export default function DataTable({
  columns,
  rows,
  loading,
  meta,
  sortKey,
  sortDir,
  onSort,
  onPage,
  onLimit,
  pageSizes,
  rowKey,
  onRowClick,
  emptyTitle,
  emptyHint,
  emptyActionLabel,
  emptyActionTo,
  onEmptyAction,
  skeletonRows,
  resizable,
  pinnedBg
}) {
  const t = useT();
  const surface = useSurface();

  /* The hairline that marks a frozen edge - stronger than a row rule. */
  const pinEdge = useColorModeValue('ink.200', 'ink.500');
  const handleColor = useColorModeValue('ink.300', 'ink.500');

  const canResize = resizable !== false;

  /* ------------------------------------------------------------- columns */

  /**
   * The columns in the order they are DRAWN, with the pinned ones pulled to
   * the edges. `left` and `right` are the ones that actually got frozen.
   */
  const layout = useMemo(() => orderColumns(columns), [columns]);

  const visible = layout.list;

  /* -------------------------------------------------------------- widths */

  const headRefs = useRef({});
  /** What each column measured at before anybody dragged it. */
  const natural = useRef({});
  const [widths, setWidths] = useState({});
  const [dragging, setDragging] = useState(null);

  /*
   * MEASURE ONCE PER COLUMN, after the browser has laid the table out.
   *
   * useLayoutEffect rather than useEffect so the switch to fixed widths
   * happens before the frame is painted - in useEffect the table visibly
   * reflows on load. The `found` guard is what stops this looping: a column
   * that already has a width is never measured again, so the state settles
   * on the second pass and stays there.
   *
   * A width of 0 means the table is not on screen - jsdom under test, or a
   * `display: none` ancestor - and is deliberately not recorded. Freezing
   * and fixed layout both wait until every column has a real number.
   */
  useLayoutEffect(() => {
    const measured = {};
    let found = false;

    visible.forEach((column) => {
      if (widths[column.key] !== undefined) return;
      const element = headRefs.current[column.key];
      const declared = pxOf(column.width);
      const wide = declared || (element ? element.offsetWidth : 0);
      if (wide > 0) {
        measured[column.key] = wide;
        natural.current[column.key] = wide;
        found = true;
      }
    });

    if (found) setWidths((current) => ({ ...current, ...measured }));
  }, [visible, widths]);

  /*
   * THE DRAG LIVES ON THE WINDOW, not on the handle.
   *
   * A pointer travelling faster than React re-renders leaves the handle
   * behind, and a mouseup outside it would never arrive - so the column
   * would still be resizing after the button came up. Listening on the
   * window for the length of the drag is what makes it survive both.
   */
  useEffect(() => {
    if (!dragging) return undefined;

    const move = (event) => {
      /* Read from the native event first; the updater below only sees `next`. */
      const next = Math.max(dragging.min, dragging.startWidth + (event.clientX - dragging.startX));
      setWidths((current) => ({ ...current, [dragging.key]: next }));
    };

    const stop = () => setDragging(null);

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);

    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    /* Without this the drag selects every header it passes over. */
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [dragging]);

  /**
   * How narrow this column may be dragged.
   *
   * A column that declared itself 56px wide - and several did, long before
   * any of this - must not JUMP to 72 the instant somebody touches its
   * edge, so the floor is the smaller of the default and the width the
   * column was born at. 40px is the hard stop below which a header is a
   * single ellipsis.
   */
  const floorFor = (column) => {
    if (column.minWidth) return column.minWidth;
    const born = natural.current[column.key] || MIN_WIDTH;
    return Math.max(40, Math.min(MIN_WIDTH, born));
  };

  const startDrag = (event, column) => {
    /* The handle sits inside a header that may sort; a drag is not a click. */
    event.preventDefault();
    event.stopPropagation();

    const element = headRefs.current[column.key];
    setDragging({
      key: column.key,
      startX: event.clientX,
      startWidth: (element && element.offsetWidth) || widths[column.key] || MIN_WIDTH,
      min: floorFor(column)
    });
  };

  const nudge = (event, column) => {
    const step = event.key === 'ArrowRight' ? KEY_STEP : event.key === 'ArrowLeft' ? -KEY_STEP : 0;
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();

    const floor = floorFor(column);
    setWidths((current) => {
      const from = current[column.key] || MIN_WIDTH;
      return { ...current, [column.key]: Math.max(floor, from + step) };
    });
  };

  /** Double-clicking an edge puts the column back where it laid itself out. */
  const reset = (event, column) => {
    event.preventDefault();
    event.stopPropagation();
    const back = natural.current[column.key];
    if (back) setWidths((current) => ({ ...current, [column.key]: back }));
  };

  /*
   * Everything below waits on this. Until every column has a measured width
   * there is nothing to write into a colgroup and no offset to park a frozen
   * column at, so the table renders as it always did - which is also exactly
   * what happens under test, where nothing has a width at all.
   */
  const sized = visible.length > 0 && visible.every((column) => widths[column.key] > 0);
  const totalWidth = sized
    ? visible.reduce((sum, column) => sum + widths[column.key], 0)
    : 0;

  /** How far from each edge a frozen column starts. */
  const offsets = useMemo(() => {
    const left = {};
    const right = {};
    let running = 0;

    layout.left.forEach((column) => {
      left[column.key] = running;
      running += widths[column.key] || 0;
    });

    running = 0;
    layout.right.slice().reverse().forEach((column) => {
      right[column.key] = running;
      running += widths[column.key] || 0;
    });

    return { left: left, right: right };
  }, [layout, widths]);

  /**
   * What makes a cell stick. `null` for everything that does not, so the
   * props below spread to nothing rather than to a pile of undefineds.
   */
  const stickyProps = (column, isHeader) => {
    if (!sized) return null;

    const onLeft = offsets.left[column.key] !== undefined;
    const onRight = offsets.right[column.key] !== undefined;
    if (!onLeft && !onRight) return null;

    const last = onLeft && layout.left[layout.left.length - 1] === column;
    const first = onRight && layout.right[0] === column;

    return {
      position: 'sticky',
      left: onLeft ? offsets.left[column.key] + 'px' : undefined,
      right: onRight ? offsets.right[column.key] + 'px' : undefined,
      /* The header's frozen cells pass over the body's, not under them. */
      zIndex: isHeader ? 3 : 2,
      bg: pinnedBg || surface.page,
      /* Only the inner edge is drawn, and only on the column next to the scroll. */
      borderRightWidth: last ? '1px' : undefined,
      borderLeftWidth: first ? '1px' : undefined,
      borderRightColor: last ? pinEdge : undefined,
      borderLeftColor: first ? pinEdge : undefined
    };
  };

  const keyFor = (row, index) => (rowKey ? rowKey(row) : row.id !== undefined ? row.id : index);

  /* One-based, and continuing across pages - see the note above. */
  const numberOf = (index) => {
    const page = (meta && meta.page) || 1;
    const limit = (meta && meta.limit) || (rows || []).length;
    return ((page - 1) * limit) + index + 1;
  };

  const headerCell = (column, index) => {
    const sortable = !!column.sortKey && !!onSort;
    const active = sortable && sortKey === column.sortKey;
    const draggable = canResize && column.resizable !== false && index < visible.length - 1;

    return (
      <Th
        key={column.key}
        ref={(element) => {
          headRefs.current[column.key] = element;
        }}
        width={sized ? undefined : column.width}
        textAlign={column.align || 'left'}
        whiteSpace="nowrap"
        cursor={sortable ? 'pointer' : 'default'}
        userSelect="none"
        position="relative"
        {...stickyProps(column, true)}
        onClick={
          sortable
            ? () => onSort(column.sortKey, active && sortDir === 'asc' ? 'desc' : 'asc')
            : undefined
        }
      >
        <Flex
          align="center"
          gap="1" data-gap="4"
          justify={column.align === 'right' ? 'flex-end' : 'flex-start'}
          overflow="hidden"
        >
          <Box as="span" isTruncated>
            {t(column.label)}
          </Box>
          {active && (
            <Box as={sortDir === 'asc' ? ChevronUpIcon : ChevronDownIcon} boxSize="4" flexShrink={0} />
          )}
        </Flex>

        {/*
          THE GRAB AREA IS WIDER THAN THE LINE IT DRAWS.

          A 1px target is a target nobody hits. The box is 10px wide and
          straddles the boundary; what is visible is the 2px bar inside it,
          and only once the pointer is over it or the drag is live. The LAST
          column has no handle: there is nothing to its right to give the
          pixels to, so dragging it would only change the table's width.
        */}
        {draggable && (
          <Box
            as="span"
            role="separator"
            aria-orientation="vertical"
            aria-label={t('components.datatable.resizeColumn')}
            tabIndex={0}
            position="absolute"
            top="0"
            bottom="0"
            right="-5px"
            width="10px"
            zIndex="1"
            cursor="col-resize"
            onMouseDown={(event) => startDrag(event, column)}
            onDoubleClick={(event) => reset(event, column)}
            onKeyDown={(event) => nudge(event, column)}
            onClick={(event) => event.stopPropagation()}
            _hover={{ '& > span': { opacity: 1 } }}
            _focus={{ '& > span': { opacity: 1 }, outline: 'none' }}
          >
            <Box
              as="span"
              display="block"
              position="absolute"
              top="25%"
              bottom="25%"
              left="4px"
              width="2px"
              borderRadius="2px"
              bg={dragging && dragging.key === column.key ? 'brand.500' : handleColor}
              opacity={dragging && dragging.key === column.key ? 1 : 0}
              transition="opacity 120ms ease"
            />
          </Box>
        )}
      </Th>
    );
  };

  const isEmpty = !loading && (!rows || rows.length === 0);

  return (
    <Box>
      <Box display={{ base: 'none', md: 'block' }} overflowX="auto">
        <Table
          size="sm"
          minW="100%"
          w={sized ? totalWidth + 'px' : undefined}
          sx={sized ? { tableLayout: 'fixed' } : undefined}
        >
          {/*
            The single source of truth for column widths, read by the header
            and the body alike - which is what keeps them lined up.
          */}
          {sized && (
            <colgroup>
              {visible.map((column) => (
                <col key={column.key} style={{ width: widths[column.key] + 'px' }} />
              ))}
            </colgroup>
          )}

          <Thead>
            <Tr>{visible.map(headerCell)}</Tr>
          </Thead>
          <Tbody>
            {loading &&
              Array.from({ length: skeletonRows || 6 }).map((ignored, index) => (
                <Tr key={`skeleton-${index}`}>
                  {visible.map((column) => (
                    <Td key={column.key} {...stickyProps(column, false)}>
                      <Skeleton height="14px" borderRadius="6px" />
                    </Td>
                  ))}
                </Tr>
              ))}

            {!loading &&
              (rows || []).map((row, index) => (
                <Tr
                  key={keyFor(row, index)}
                  /*
                    The hover has to be declared on the GROUP, because a frozen
                    cell paints its own opaque background over the row's - so
                    `_hover` on the row alone would light up everything except
                    the two columns the pointer is most likely to be near.
                  */
                  /* data-group rather than role="group": a <tr> has an
                     implicit ARIA role of "row" and overriding it would cost a
                     screen reader the table structure. Chakra reads either. */
                  data-group=""
                  cursor={onRowClick ? 'pointer' : 'default'}
                  _hover={onRowClick ? { bg: surface.hover } : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visible.map((column) => {
                    const pinned = stickyProps(column, false);

                    return (
                      <Td
                        key={column.key}
                        textAlign={column.align || 'left'}
                        {...pinned}
                        _groupHover={pinned && onRowClick ? { bg: surface.hover } : undefined}
                      >
                        {column.render ? column.render(row, numberOf(index)) : row[column.key]}
                      </Td>
                    );
                  })}
                </Tr>
              ))}
          </Tbody>
        </Table>
      </Box>

      <Stack display={{ base: 'flex', md: 'none' }} spacing="3">
        {loading &&
          Array.from({ length: 3 }).map((ignored, index) => (
            <Skeleton key={`card-skeleton-${index}`} height="96px" borderRadius="12px" />
          ))}

        {!loading &&
          (rows || []).map((row, index) => (
            <Box
              key={keyFor(row, index)}
              borderRadius="12px"
              border="1px solid"
              borderColor={surface.border}
              p="4"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {visible
                .filter((column) => !column.hideOnCard)
                .map((column) => (
                  <Flex key={column.key} gap="3" data-gap="12" py="1" align="baseline">
                    <Text
                      fontSize="xs"
                      color={surface.muted}
                      minW="96px"
                      textTransform="uppercase"
                      letterSpacing="0.4px"
                    >
                      {t(column.label)}
                    </Text>
                    <Box fontSize="sm" flex="1" minW="0">
                      {column.render ? column.render(row, numberOf(index)) : row[column.key]}
                    </Box>
                  </Flex>
                ))}
            </Box>
          ))}
      </Stack>

      {isEmpty && (
        <EmptyState
          title={emptyTitle}
          hint={emptyHint}
          actionLabel={emptyActionLabel}
          actionTo={emptyActionTo}
          onAction={onEmptyAction}
          py={12}
        />
      )}

      <Pagination meta={meta} onPage={onPage} onLimit={onLimit} pageSizes={pageSizes} />
    </Box>
  );
}
