import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Table, Thead, Tbody, Tr, Th, Td, Flex, Text, Spinner, Box, Button,
  Icon, Menu, MenuButton, MenuList, MenuItem, Tooltip, Portal,
  useBreakpointValue, useColorModeValue
} from '@chakra-ui/react';
import { TriangleDownIcon, TriangleUpIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { MdMoreHoriz } from 'react-icons/md';
import Pagination from './Pagination';
import { useI18n } from '../i18n';

const MIN_COL_WIDTH = 60;

/**
 * HOW MANY COLUMNS MAY BE FROZEN AT EACH EDGE.
 *
 * Two, and the count includes the columns this component injects itself - the
 * expander takes a left slot, the action column a right one.  That is the
 * honest way to count it, because the budget being spent is screen width:
 * three frozen columns on a laptop leave a sliver of table between them, and
 * the sliver is the part somebody is scrolling to read.
 *
 * Over the limit the pin is dropped and the column scrolls with the rest,
 * which is the failure that leaves the table usable.  Left-hand pins are
 * counted from the left inwards and right-hand ones from the right inwards,
 * so it is always the columns nearest the edge that keep their pin.
 */
const MAX_PINNED = 2;

/** Where a table's hand-set column widths are kept, per screen. */
const WIDTH_STORE = 'crystal.admin.tableWidths.';

/**
 * WIDTHS ARE REMEMBERED PER SCREEN, and only the ones somebody dragged.
 *
 * Storing every measured width would freeze a table nobody ever resized: the
 * next release adds a column, or a longer name arrives, and the table keeps
 * laying itself out to last month's content.  Only a deliberate drag is worth
 * keeping, so only a deliberate drag is written.
 *
 * localStorage rather than the account, for the same reason the appearance
 * settings live there: a column width is a property of the screen it is being
 * read on, and a width dragged out on a 27" monitor is wrong on a laptop.
 *
 * Both sides swallow their errors. Storage is off in a private window and
 * throws when the quota is full, and neither is a reason for a table not to
 * draw - the columns simply go back to measuring themselves.
 */
function readWidths(key) {
  if (!key) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WIDTH_STORE + key));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function writeWidths(key, widths) {
  if (!key) return;
  try {
    window.localStorage.setItem(WIDTH_STORE + key, JSON.stringify(widths));
  } catch (e) {
    /* nothing to do: the drag still holds for as long as the page is open */
  }
}

/** Shallow equality, so re-measuring an unchanged table does not re-render it. */
function sameWidths(a, b) {
  const names = Object.keys(a);
  if (names.length !== Object.keys(b).length) return false;
  return names.every((name) => a[name] === b[name]);
}

/**
 * How many inline actions still fit comfortably in a row, by how wide they are.
 *
 * An icon button is 36px against roughly a hundred for a labelled one, so the
 * row that is full at two labels is not full at three glyphs.  A screen that
 * hands in its own control (`render`) is measured by the narrow rule, because
 * whatever it hands in is a full button with words in it.
 */
const AUTO_BUTTON_LIMIT = 2;
const AUTO_ICON_BUTTON_LIMIT = 3;

/**
 * columns: [{
 *   key, label, render(row), isNumeric, width, minWidth, sortable, strong,
 *   pin: 'left' | 'right',      // frozen column, stays put while the table
 *                               // scrolls sideways.  Two per edge at most -
 *                               // see MAX_PINNED - and left hand pins are
 *                               // dropped on phones, see freezeLeft below.
 *                               // `sticky` is the older spelling and still
 *                               // works.
 *   resizable: false,           // opt a single column out of resizing
 *   nowrap: true,               // never wrap this column, clip it instead
 *   highlight(row)              // per-cell highlight test
 * }]
 *
 * PINNING AND RESIZING, AND WHAT THE DEFAULTS ARE.
 *
 * Every column is resizable unless it says otherwise: drag the handle at the
 * right hand edge of its heading, and double-click any handle to put the
 * whole table back to the widths it chose for itself.  `resizableColumns=
 * {false}` turns the handles off for a table that is not meant to be pulled
 * about - a five row dashboard panel.  The first drag pins every column at
 * its measured width, because otherwise the browser redistributes the slack
 * and the neighbours jump; from then on a narrowed column wraps rather than
 * clipping, which is the trade the drag was asking for.
 *
 * Hand-set widths are remembered per screen when the caller passes a
 * `storageKey` - CrudPage passes the page path, so every master table in the
 * console keeps its widths without asking for anything.  A table with no key
 * still resizes, it just forgets.
 *
 * NOTHING IS PINNED BY DEFAULT except the columns this component adds: the
 * expander freezes left and the action column freezes right, which is what
 * makes a wide table still openable without scrolling back.  A screen pins
 * its own identifying column with `pin: 'left'` and should think twice before
 * pinning a second - see MAX_PINNED for why the budget is two.
 *
 * actions: [{ key, label, icon, color, onClick(row), hidden(row), isDisabled(row) }]
 * actionsMode: 'buttons' | 'menu' | 'auto'   (auto = buttons up to two actions)
 * actionsPosition: 'right' (default) | 'left'  - which edge the frozen action
 *                  column is pinned to
 * actionsWidth: fixed width for that column, e.g. '10rem'.  Left off, the
 *               column shrinks to fit its buttons instead of stretching.
 * actionsIconOnly: DEFAULT.  The row's actions are icon buttons and the label
 *                  moves to a tooltip - edit and delete are the same two
 *                  glyphs on every screen in the console, and spelling them
 *                  out on every row costs a column of width to say what the
 *                  icon already said.  Pass `false` on a screen whose actions
 *                  are not conventional enough to be recognised as a glyph
 *                  ('Issue licence', 'Reopen'), where the word is the whole
 *                  affordance.  An action with no `icon` keeps its label
 *                  whatever this says, because there would be nothing left.
 */
export default function DataTable({
  columns, rows, loading, page, limit, total, pageSizes, siblings,
  sort, dir, onSort, onPageChange, onLimitChange, emptyText, hidePagination, showGoto,
  actions, actionsMode, actionsLabel, actionsPosition, actionsWidth, actionsIconOnly,
  rowKey, highlightRow, onRowClick, onRowDoubleClick, rowHint, selectedKey, renderExpanded,
  resizableColumns, minHeight, storageKey
}) {
  const { t } = useI18n();

  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.600', 'secondaryGray.500');
  const borderColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.50');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const surfaceBg = useColorModeValue('white', 'navy.800');
  const rowHighlightBg = useColorModeValue('#E4DEFA', 'rgba(91, 63, 224, 0.16)');
  const cellHighlightBg = useColorModeValue('#FFF6DA', 'rgba(255, 181, 71, 0.18)');
  const selectedBg = useColorModeValue('#DCD6F7', 'rgba(91, 63, 224, 0.28)');
  const handleColor = useColorModeValue('secondaryGray.400', 'whiteAlpha.300');
  const overlayBg = useColorModeValue('rgba(255, 255, 255, 0.45)', 'rgba(6, 12, 34, 0.45)');
  const expandedBg = useColorModeValue('secondaryGray.300', 'rgba(255, 255, 255, 0.03)');
  const stickyEdge = useColorModeValue(
    'inset -1px 0 0 var(--chakra-colors-secondaryGray-100)',
    'inset -1px 0 0 var(--chakra-colors-whiteAlpha-200)'
  );
  const stickyEdgeRight = useColorModeValue(
    'inset 1px 0 0 var(--chakra-colors-secondaryGray-100)',
    'inset 1px 0 0 var(--chakra-colors-whiteAlpha-200)'
  );

  const [widths, setWidths] = useState({});
  const [frozen, setFrozen] = useState(false);
  const headRefs = useRef({});
  const dragRef = useRef(null);

  /* Which columns were dragged by hand - the only ones worth writing down. */
  const touched = useRef({});
  const restored = useRef(false);

  const allowResize = resizableColumns !== false;
  const hasActions = !!(actions && actions.length);
  const isNarrow = useBreakpointValue({ base: true, md: false });

  // 'auto' counts what is actually visible, not the raw action list: a table
  // carrying mutually exclusive actions (edit/delete vs restore) still only
  // ever shows a couple per row and deserves real buttons.
  const maxVisibleActions = useMemo(() => {
    if (!hasActions) return 0;
    return (rows || []).reduce(
      (most, row) => Math.max(most, actions.filter((a) => !(a.hidden && a.hidden(row))).length),
      0
    );
  }, [actions, rows, hasActions]);

  /*
   * Whether the action column is narrow enough for the wider limit: every
   * action is a glyph, and none of them is a control the screen drew itself.
   */
  const allIcons = hasActions
    && actionsIconOnly !== false
    && actions.every((a) => !!a.icon && !a.render);

  const buttonLimit = allIcons ? AUTO_ICON_BUTTON_LIMIT : AUTO_BUTTON_LIMIT;

  const useButtons = hasActions && (
    actionsMode === 'buttons' ||
    (actionsMode !== 'menu' && !isNarrow && maxVisibleActions <= buttonLimit)
  );

  const actionsSide = actionsPosition === 'left' ? 'left' : 'right';

  /**
   * On a phone a frozen column on each edge leaves a sliver of table to scroll
   * between them, which is the one part the user actually came to read.  The
   * right edge is the half worth keeping - the actions are what the row is
   * opened for, and they stay reachable without scrolling back - so a left hand
   * freeze is let go there and scrolls along with everything else.
   */
  const freezeLeft = !isNarrow;
  const canExpand = typeof renderExpanded === 'function';
  const [expanded, setExpanded] = useState({});

  const toggleExpanded = useCallback((key) => {
    setExpanded((prev) => {
      const next = Object.assign({}, prev);
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, []);

  // The action column is a real column so it freezes, resizes and measures
  // like any other.  `render` is looked up lazily so it can point at
  // renderActions, which is declared further down.
  const allColumns = useMemo(() => {
    /*
     * `pin` is the word this component takes; `sticky` is what it used to be
     * called and is still accepted, because renaming a prop is not worth a
     * screen rendering a column that quietly stopped being frozen.
     */
    let list = columns.map((c) => {
      const pin = c.pin || c.sticky;
      if (!pin) return c;
      // A left hand pin is let go on a phone - see freezeLeft above.
      return Object.assign({}, c, { pin: pin === 'left' && !freezeLeft ? undefined : pin });
    });

    if (canExpand) {
      list = [{
        key: '__expand',
        label: '',
        pin: freezeLeft ? 'left' : undefined,
        resizable: false,
        width: '1%',
        minWidth: 34,
        // Normal cell padding on both sides is what made this column look
        // twice as wide as the button inside it.
        cellPx: '0.25rem'
      }].concat(list);
    }

    if (hasActions) {
      const actionColumn = {
        key: '__actions',
        label: '',
        pin: actionsSide === 'left' && !freezeLeft ? undefined : actionsSide,
        resizable: false,
        isNumeric: actionsSide === 'right',
        // '1%' is the table trick for shrink-to-fit: the cell takes only what
        // its content needs instead of soaking up the leftover width.
        width: actionsWidth || '1%'
      };

      list = actionsSide === 'left'
        ? [actionColumn].concat(list)
        : list.concat([actionColumn]);
    }

    /*
     * THE BUDGET, SPENT FROM EACH EDGE INWARDS.
     *
     * Left hand pins are counted left to right and right hand ones right to
     * left, so the column nearest the edge is the one that keeps its pin and
     * the third one simply scrolls.  Silently, and deliberately: a table that
     * refused to draw because a screen asked for one pin too many would be a
     * worse answer than a table with one fewer frozen column.
     */
    let left = 0;
    let right = 0;

    list = list.map((c) => {
      if (c.pin !== 'left') return c;
      left += 1;
      return left > MAX_PINNED ? Object.assign({}, c, { pin: undefined }) : c;
    });

    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].pin !== 'right') continue;
      right += 1;
      if (right > MAX_PINNED) list[i] = Object.assign({}, list[i], { pin: undefined });
    }

    return list;
  }, [columns, hasActions, actionsSide, actionsWidth, canExpand, freezeLeft]);

  /*
   * Where each pinned column parks, in pixels from its own edge.
   *
   * Both directions accumulate, which is what makes a SECOND pin work: the
   * right hand pair used to be given `right: 0` apiece and drew on top of
   * each other, so a table with actions plus one pinned column showed one of
   * them and hid the other under it.
   */
  const pinOffsets = useMemo(() => {
    const out = { left: {}, right: {} };

    let acc = 0;
    allColumns.forEach((c) => {
      if (c.pin !== 'left') return;
      out.left[c.key] = acc;
      acc += widths[c.key] || 0;
    });

    acc = 0;
    for (let i = allColumns.length - 1; i >= 0; i -= 1) {
      const c = allColumns[i];
      if (c.pin !== 'right') continue;
      out.right[c.key] = acc;
      acc += widths[c.key] || 0;
    }

    return out;
  }, [allColumns, widths]);

  /**
   * MEASURE, so a pinned column knows what to park behind.
   *
   * This has to walk allColumns, not columns: the expand and action columns
   * are injected here, and leaving them unmeasured makes every pin offset
   * after them short by their width - which parks the next frozen column on
   * top of the expander.
   *
   * It re-measures when the page of rows changes rather than once on mount.
   * An untouched table lays itself out from its content, so a page of longer
   * names changes the real widths under us, and a stale measurement is a
   * second pinned column sitting in the wrong place. Once somebody has
   * dragged, the widths are the ones they set and measuring again would undo
   * them.
   *
   * KEYED ON A SIGNATURE, not on the column array. Most screens build their
   * column list inline, so `allColumns` is a new object on every render -
   * and reading offsetWidth forces the browser to lay the table out then and
   * there. Doing that on every keystroke in the search box is exactly the
   * sort of cost that only shows up on the slowest machine somebody owns.
   */
  const measureKey = allColumns.map((c) => c.key).join('|') + '@' + (rows ? rows.length : 0);

  useLayoutEffect(() => {
    const measured = {};
    let any = false;

    allColumns.forEach((c) => {
      const node = headRefs.current[c.key];
      if (node && node.offsetWidth) { measured[c.key] = node.offsetWidth; any = true; }
    });

    if (!any) return;

    /* The widths this screen was last left at, applied over the measurement. */
    if (!restored.current) {
      restored.current = true;
      const kept = readWidths(storageKey);

      if (kept && Object.keys(kept).length) {
        Object.keys(kept).forEach((name) => {
          if (typeof kept[name] !== 'number') return;
          touched.current[name] = true;
          measured[name] = kept[name];
        });
        setWidths(measured);
        setFrozen(true);
        return;
      }
    }

    if (frozen) return;
    // Returning the previous object bails the update out, so an unchanged
    // measurement costs no render at all.
    setWidths((prev) => (sameWidths(measured, prev) ? prev : measured));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureKey, frozen, storageKey]);

  const startResize = useCallback((event, key) => {
    event.preventDefault();
    event.stopPropagation();

    // Pin every column at its current width first, otherwise the browser
    // redistributes the slack and the neighbouring columns jump around.
    const snapshot = {};
    allColumns.forEach((c) => {
      const node = headRefs.current[c.key];
      snapshot[c.key] = (node && node.offsetWidth) || widths[c.key] || 120;
    });

    setWidths(snapshot);
    setFrozen(true);

    dragRef.current = { key: key, startX: event.clientX, startWidth: snapshot[key] };

    let settled = snapshot;
    let moved = false;

    const onMove = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      moved = true;
      const column = allColumns.filter((c) => c.key === drag.key)[0] || {};
      const floor = column.minWidth || MIN_COL_WIDTH;
      const next = Math.max(floor, drag.startWidth + (moveEvent.clientX - drag.startX));
      setWidths((prev) => {
        settled = Object.assign({}, prev, { [drag.key]: next });
        return settled;
      });
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      /*
       * Written on mouse UP rather than on every move: a drag is a couple of
       * hundred events and localStorage is synchronous, so writing per frame
       * is how a resize turns into a stutter.
       *
       * And only if the pointer actually travelled. A press that went nowhere
       * is a misclick or the first half of the double-click that resets the
       * table, and neither is somebody choosing a width to keep.
       */
      if (!moved) return;
      touched.current[key] = true;
      const keep = {};
      Object.keys(touched.current).forEach((name) => {
        if (settled[name]) keep[name] = settled[name];
      });
      writeWidths(storageKey, keep);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [allColumns, widths, storageKey]);

  /**
   * THE WAY BACK, on a double-click of any handle.
   *
   * A drag that goes wrong has no undo otherwise, and a column dragged down
   * to its floor on a table whose widths are remembered is a screen that
   * stays broken across reloads. It resets the whole table rather than the
   * one column: putting a single column back to its natural width while the
   * others are pinned means re-measuring inside a fixed layout that is
   * already telling it what to be, and unfreezing everything gets the same
   * answer in one line.
   */
  const resetWidths = useCallback(() => {
    touched.current = {};
    writeWidths(storageKey, {});
    setFrozen(false);
    setWidths({});
  }, [storageKey]);

  const sortIcon = (key) => {
    if (sort !== key) return null;
    return (
      <Icon
        as={dir === 'asc' ? TriangleUpIcon : TriangleDownIcon}
        ms="0.375rem" w="0.5rem" h="0.5rem" color={brandColor}
      />
    );
  };

  /**
   * A PINNED CELL NEEDS ITS OWN BACKGROUND, or the rows it is standing over
   * show straight through it - `position: sticky` lifts a cell out of the
   * scroll, it does not make it opaque.
   *
   * `data-pinned` is what lets the row's hover colour reach these cells too:
   * the hover is set on the <tr>, and a cell carrying its own bg would
   * otherwise be the one column that stays cold while the rest of the row
   * lights up.  See the Tr below.
   */
  const pinProps = (column, isHeader, background) => {
    if (!column.pin) return {};
    return {
      position: 'sticky',
      left: column.pin === 'left' ? (pinOffsets.left[column.key] || 0) + 'px' : undefined,
      right: column.pin === 'right' ? (pinOffsets.right[column.key] || 0) + 'px' : undefined,
      zIndex: isHeader ? 3 : 1,
      bg: background,
      boxShadow: column.pin === 'left' ? stickyEdge : stickyEdgeRight,
      'data-pinned': column.pin
    };
  };

  /** Wrapping is what a hand-set width buys; an untouched table never needs it. */
  const wraps = (column) => frozen && !column.nowrap;

  const keyOf = (row, index) => (rowKey ? rowKey(row, index) : index);

  const actionsJustify = actionsSide === 'left' ? 'flex-start' : 'flex-end';

  // Opt out with `actionsIconOnly={false}`, not by leaving it off.
  const iconActions = actionsIconOnly !== false;

  // Anything pinned in front of the data shifts which column is really first,
  // and that is the one that should carry the bold treatment.
  const firstDataIndex =
    (canExpand ? 1 : 0) + (hasActions && actionsSide === 'left' ? 1 : 0);

  const renderActions = (row) => {
    if (!hasActions) return null;

    const visible = actions.filter((a) => !(a.hidden && a.hidden(row)));
    if (!visible.length) return null;

    if (useButtons) {
      return (
        <Flex gap="0.5rem" data-gap="8" justify={actionsJustify}>
          {visible.map((a) => {
            // An action may bring its own control - a screen with a bespoke
            // button per row hands one in rather than being made to describe
            // it as an icon and a label it does not have.
            if (a.render) return <React.Fragment key={a.key}>{a.render(row)}</React.Fragment>;

            const iconOnly = iconActions && !!a.icon;
            const disabled = !!(a.isDisabled && a.isDisabled(row));

            const button = (
              <Button
                size="sm" h="2.25rem" borderRadius="0.75rem"
                // Icon-only still gets a 36x36 hit area - a bare glyph is a
                // fiddly target, especially on a dense table.
                px={iconOnly ? '0' : '0.875rem'}
                minW={iconOnly ? '2.25rem' : undefined}
                w={iconOnly ? '2.25rem' : undefined}
                variant={a.color === 'red' ? 'outline' : 'subtle'}
                color={a.color === 'red' ? 'red.400' : undefined}
                borderColor={a.color === 'red' ? 'red.400' : undefined}
                fontSize="xs" fontWeight="600"
                aria-label={t(a.label)}
                isDisabled={disabled}
                leftIcon={!iconOnly && a.icon ? <Icon as={a.icon} w="0.75rem" h="0.75rem" /> : undefined}
                onClick={(e) => { e.stopPropagation(); a.onClick(row); }}
              >
                {iconOnly ? <Icon as={a.icon} w="0.9375rem" h="0.9375rem" /> : a.label}
              </Button>
            );

            if (!iconOnly) return <React.Fragment key={a.key}>{button}</React.Fragment>;

            return (
              <Tooltip
                key={a.key}
                label={t(a.label)}
                openDelay={250}
                placement="top"
                hasArrow
                /*
                 * A DISABLED button is exactly the one whose tooltip matters -
                 * it is the only thing that says why it cannot be pressed -
                 * and it is the one case where the tooltip does not appear:
                 * a disabled element fires no pointer events, so nothing ever
                 * reaches the trigger. `shouldWrapChildren` puts a focusable
                 * span around it that can. Only when disabled, because the
                 * wrapper is an extra element in the flex row and an extra
                 * tab stop.
                 */
                shouldWrapChildren={disabled}
              >
                {button}
              </Tooltip>
            );
          })}
        </Flex>
      );
    }

    return (
      <Flex justify={actionsJustify}>
        <Menu isLazy placement={actionsSide === 'left' ? 'bottom-start' : 'bottom-end'}>
          {/* Same treatment as the inline icon buttons above, so the two
              modes of this column do not tooltip differently. */}
          <Tooltip
            label={actionsLabel || t('table.moreActions')}
            openDelay={250}
            placement="top"
            hasArrow
          >
            <MenuButton
              as={Button} variant="subtle" borderRadius="0.75rem"
              minW="2.25rem" w="2.25rem" h="2.125rem" p="0"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon as={MdMoreHoriz} color={mutedColor} w="1.125rem" h="1.125rem" />
            </MenuButton>
          </Tooltip>
          {/*
            The table scrolls inside `overflow: auto`, which clips anything an
            inline menu paints outside the viewport.  Portalling it to the body
            lets the full list show even on the last row of the table.
          */}
          <Portal>
            <MenuList minW="11.25rem" p="0.375rem" borderRadius="0.5rem" zIndex="dropdown" bg={surfaceBg}>
              {visible.map((a) => (a.render ? (
                <Box key={a.key} px="0.5rem" py="0.375rem">{a.render(row)}</Box>
              ) : (
                <MenuItem
                  key={a.key} borderRadius="0.625rem" px="0.75rem" py="0.625rem"
                  bg="transparent"
                  isDisabled={a.isDisabled && a.isDisabled(row)}
                  onClick={(e) => { e.stopPropagation(); a.onClick(row); }}
                >
                  {a.icon ? (
                    <Icon
                      as={a.icon} w="0.8125rem" h="0.8125rem" me="0.625rem"
                      color={a.color === 'red' ? 'red.400' : mutedColor}
                    />
                  ) : null}
                  <Text
                    fontSize="sm" fontWeight="500"
                    color={a.color === 'red' ? 'red.400' : undefined}
                  >
                    {t(a.label)}
                  </Text>
                </MenuItem>
              )))}
            </MenuList>
          </Portal>
        </Menu>
      </Flex>
    );
  };

  // Keep the previous rows on screen while a sort or page change is in flight;
  // blanking the table and repopulating it reads as a full page reload.
  const showFirstLoad = loading && !rows.length;
  const showOverlay = loading && !!rows.length;

  return (
    <Box>
      <Box position="relative" minH={minHeight}>
        <Box overflowX="auto" pb="2px">
          <Table
            variant="horizon" color="gray.500" mb="0.25rem"
            /*
             * `border-collapse: separate` IS WHAT MAKES THE PINNING WORK.
             *
             * Chakra's own table style is `collapse`, and Chrome ignores
             * `position: sticky` on a th or td inside a collapsed table until
             * version 91 - so every frozen column in this component scrolled
             * away on the browser this console has to support, and looked
             * perfect on the machine it was written on.  With no spacing the
             * two modes draw identically; the cell borders are set per cell
             * here, so nothing doubles up.
             */
            sx={Object.assign(
              { borderCollapse: 'separate', borderSpacing: 0 },
              frozen ? { tableLayout: 'fixed', width: 'max-content', minWidth: '100%' } : null
            )}
          >
            <Thead>
              <Tr>
                {allColumns.map((c) => {
                  const canResize = allowResize && c.resizable !== false && c.key !== '__actions';
                  return (
                    <Th
                      key={c.key}
                      ref={(node) => { headRefs.current[c.key] = node; }}
                      borderColor={borderColor}
                      isNumeric={c.isNumeric}
                      width={frozen && widths[c.key] ? widths[c.key] + 'px' : c.width}
                      minWidth={c.minWidth}
                      whiteSpace={wraps(c) ? 'normal' : 'nowrap'}
                      userSelect="none"
                      px={c.cellPx}
                      position={c.pin ? undefined : 'relative'}
                      {...pinProps(c, true, surfaceBg)}
                    >
                      <Flex
                        justify={c.isNumeric ? 'flex-end' : 'flex-start'}
                        align="center" fontSize={{ sm: '0.625rem', lg: '0.75rem' }} color="gray.400"
                        textTransform="uppercase" letterSpacing="0.4px"
                        cursor={c.sortable && onSort ? 'pointer' : 'default'}
                        onClick={() => (c.sortable && onSort ? onSort(c.key) : null)}
                        pe={canResize ? '0.625rem' : '0'}
                      >
                        <Text
                          as="span"
                          overflowWrap={wraps(c) ? 'anywhere' : undefined}
                          overflow={wraps(c) ? undefined : 'hidden'}
                          textOverflow={wraps(c) ? undefined : 'ellipsis'}
                          color={sort === c.key ? brandColor : 'inherit'}
                        >
                          {/*
                            * BY ENGLISH TEXT, because a column has no key to
                            * write: every screen declares `label: 'Device
                            * type'` and the catalogue is matched on the words.
                            *
                            * This was rendered raw, so every table heading in
                            * the console stayed English on a Chinese screen -
                            * while the form beside it, which does call t() on
                            * the same field labels, did not.
                            */}
                          {t(c.label)}
                        </Text>
                        {c.sortable ? sortIcon(c.key) : null}
                      </Flex>

                      {canResize ? (
                        <Box
                          role="separator" aria-orientation="vertical"
                          /* Through the catalogue like every other label; it
                             was concatenated English, which a Chinese screen
                             reader announced in English. */
                          aria-label={t('table.resizeColumn', { column: t(c.label) || c.key })}
                          position="absolute" top="0" right="0" h="100%" w="0.5rem"
                          cursor="col-resize" zIndex="2"
                          onMouseDown={(e) => startResize(e, c.key)}
                          onDoubleClick={(e) => { e.stopPropagation(); resetWidths(); }}
                          onClick={(e) => e.stopPropagation()}
                          _hover={{ '& > div': { bg: brandColor } }}
                        >
                          <Box
                            w="2px" h="60%" mt="20%" mx="auto"
                            bg={handleColor} borderRadius="2px"
                            transition="background .15s ease"
                          />
                        </Box>
                      ) : null}
                    </Th>
                  );
                })}
              </Tr>
            </Thead>

            <Tbody>
              {showFirstLoad ? (
                <Tr>
                  <Td colSpan={allColumns.length} textAlign="center" py="3.75rem" borderColor="transparent">
                    <Spinner color="brand.500" thickness="3px" />
                  </Td>
                </Tr>
              ) : !rows.length ? (
                <Tr>
                  <Td colSpan={allColumns.length} textAlign="center" py="3.75rem" borderColor="transparent">
                    <Text color={mutedColor} fontSize="sm" fontWeight="500">
                      {emptyText || t('table.empty')}
                    </Text>
                  </Td>
                </Tr>
              ) : (
                rows.map((row, i) => {
                  const key = keyOf(row, i);
                  const isSelected = selectedKey !== undefined && selectedKey !== null
                    && String(selectedKey) === String(key);
                  const isHighlighted = !!(highlightRow && highlightRow(row));
                  const isExpanded = !!expanded[key];
                  const rowBg = isSelected ? selectedBg : isHighlighted ? rowHighlightBg : undefined;

                  /*
                   * The row hint goes through a themed Tooltip rather than the
                   * browser's `title`.
                   *
                   * A row that opens on DOUBLE click has to say so - a single
                   * click doing nothing reads as a broken table - and the
                   * native tooltip takes about a second to appear, in the OS
                   * font, at the pointer. That is slow enough that people
                   * click again before it shows, which is the misclick the
                   * double-click was meant to prevent.
                   *
                   * Chakra only mounts the bubble while it is open, so one
                   * Tooltip per row costs a wrapper and nothing else.
                   */
                  const rowNode = (
                    <Tr
                      bg={rowBg}
                      cursor={onRowClick || onRowDoubleClick ? 'pointer' : undefined}
                      /*
                       * The pinned cells are named explicitly, because they
                       * carry a background of their own so the scrolled rows
                       * do not show through them - and a background on the
                       * cell beats one on the row.  Without this the frozen
                       * columns were the one part of the row that stayed cold
                       * under the pointer, which reads as the hover being
                       * broken rather than as the column being special.
                       */
                      _hover={{
                        bg: rowBg || hoverBg,
                        '& > td[data-pinned]': { bg: rowBg || hoverBg }
                      }}
                      transition="background .15s ease"
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                    >
                      {allColumns.map((c, ci) => {
                        const cellLit = !!(c.highlight && c.highlight(row));
                        const cellBg = cellLit ? cellHighlightBg : rowBg;

                        return (
                          <Td
                            key={c.key}
                            borderColor={borderColor}
                            isNumeric={c.isNumeric}
                            /*
                             * Left alone, a column is as wide as its content
                             * needs and never wraps - that is the width the
                             * table is easiest to read at, and the row stays
                             * one line deep.
                             *
                             * Once somebody has dragged a column, widths are
                             * pinned and the dragged one can be narrower than
                             * what is in it.  Hiding the overflow there loses
                             * the very thing the drag was making room for, so
                             * the text wraps instead and the row grows, which
                             * is the trade the drag was asking for.  Columns
                             * still at their measured width have nothing to
                             * wrap, so only the narrowed one changes shape.
                             */
                            whiteSpace={wraps(c) ? 'normal' : 'nowrap'}
                            overflowWrap={wraps(c) ? 'anywhere' : undefined}
                            overflow={wraps(c) ? undefined : 'hidden'}
                            textOverflow={wraps(c) ? undefined : 'ellipsis'}
                            px={c.cellPx}
                            {...pinProps(c, false, cellBg || surfaceBg)}
                            bg={c.pin ? (cellBg || surfaceBg) : cellBg}
                          >
                            {c.key === '__expand' ? (
                              <Button
                                aria-label={isExpanded ? t('table.hideDetail') : t('table.showDetail')}
                                aria-expanded={isExpanded}
                                variant="ghost" size="sm"
                                minW="1.625rem" w="1.625rem" h="1.625rem" p="0" borderRadius="0.5rem"
                                onClick={(e) => { e.stopPropagation(); toggleExpanded(key); }}
                              >
                                <Icon
                                  as={ChevronRightIcon} w="1rem" h="1rem" color={mutedColor}
                                  transform={isExpanded ? 'rotate(90deg)' : 'none'}
                                  transition="transform .15s ease"
                                />
                              </Button>
                            ) : c.key === '__actions' && hasActions ? (
                              // Only the column this table added itself; a
                              // caller that supplies its own '__actions'
                              // column keeps its own render.
                              renderActions(row)
                            ) : c.render ? (
                              c.render(row)
                            ) : (
                              <Text
                                color={textColor}
                                fontSize="sm"
                                fontWeight={c.strong || ci === firstDataIndex ? '700' : '500'}
                                overflow="hidden"
                                textOverflow="ellipsis"
                              >
                                {row[c.key] === null || row[c.key] === undefined || row[c.key] === ''
                                  ? '-'
                                  : row[c.key]}
                              </Text>
                            )}
                          </Td>
                        );
                      })}
                    </Tr>
                  );

                  return (
                    <React.Fragment key={key}>
                    {rowHint && onRowDoubleClick ? (
                      <Tooltip label={rowHint} openDelay={300} placement="top" hasArrow>
                        {rowNode}
                      </Tooltip>
                    ) : rowNode}

                    {/*
                      The detail row spans the whole table so nested content
                      lays out on its own, rather than being squeezed into the
                      parent's column grid.
                    */}
                    {canExpand && isExpanded ? (
                      <Tr>
                        <Td
                          colSpan={allColumns.length}
                          borderColor={borderColor}
                          bg={expandedBg}
                          p="0"
                        >
                          <Box px="1.125rem" py="1rem">
                            {renderExpanded(row)}
                          </Box>
                        </Td>
                      </Tr>
                    ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </Tbody>
          </Table>
        </Box>

        {showOverlay ? (
          <Box
            position="absolute" top="0" left="0" right="0" bottom="0" zIndex="4"
            bg={overlayBg} pointerEvents="none"
          >
            <Flex justify="center" pt="1.625rem">
              <Spinner color="brand.500" thickness="3px" size="md" />
            </Flex>
          </Box>
        ) : null}
      </Box>

      {/*
        * No total means the caller is not paging through this table - a
        * dashboard panel, a fixed list of five - or is drawing its own
        * footer.  Either way a second one here would be wrong as well as
        * duplicated, because it would have no count to state.
        */}
      {hidePagination || total === undefined || total === null ? null : (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          pageSizes={pageSizes}
          siblings={siblings}
          showGoto={showGoto}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      )}
    </Box>
  );
}
