import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Flex, Grid, IconButton, Menu, MenuButton, MenuDivider, MenuItem,
  MenuList, Skeleton, SkeletonText, Stack, Table, Thead, Tbody, Tr, Th, Td, Text,
  useBreakpointValue, useColorModeValue,
} from '@chakra-ui/react';
import { ArrowUpDownIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { keyframes } from '@emotion/react';
import { getLangText } from 'lang/lang';

/* ------------------------------------------------------------------ *
 * Sort transition
 *
 * Re-sorting replaces every row at once, which reads as a flicker. The
 * body is keyed on the sort config so React remounts it, and this plays
 * on the new body - a short lift-and-fade that signals "these are the
 * same rows in a new order" without animating each row individually,
 * which gets expensive past a few dozen rows.
 * ------------------------------------------------------------------ */
const sortFade = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const DEFAULT_COL_WIDTH = 160;
const MIN_COL_WIDTH = 60;

/** '200px' -> 200. Anything unparseable falls back to the default. */
const toPx = (value, fallback = DEFAULT_COL_WIDTH) => {
  if (typeof value === 'number') return value;
  if (!value) return fallback;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? fallback : parsed;
};

const isEmptyValue = (value) =>
  value === null || value === undefined || value === '';

/**
 * Table with a card view, resizable and freezable columns, a frozen header
 * row, multi-row highlighting and a collapsible action menu.
 *
 * ---- headers ----
 * [{
 *   key, name,
 *   width,            e.g. '200px' - the resize starting point too
 *   sortable, sort_key,
 *   thAlign, tdAlign,
 *   ellipsis,         clamp the cell to two lines
 *   resizable: false, opt this one column out of resizing
 *   hideOnCard,       leave out of the card view
 *   cardTitle,        use as the card's headline (defaults to the first column)
 *   cardTag,          render top-right of the card, for a status Tag
 *   cardFooter,       render in the card's footer strip, for a timestamp
 *   cardSpan,         1 or 2 grid columns in the card body (default 1)
 * }]
 *
 * ---- view ----
 *   view="auto"   table from md up, cards below   (default - what the
 *                 account pages use, so the card layout is a phone-only
 *                 treatment and the desktop keeps its table)
 *   view="card"   cards at every size
 *   view="table"  never switch to cards
 *
 * ---- actions ----
 *   actions(row, isDisabled)      render your own controls, as before
 *   actionItems(row) -> [{ label, icon, onClick, isDisabled, isDanger, divider }]
 *                                 rendered behind a "..." button
 *   actionMode="inline"|"menu"|"auto"
 *                                 auto shows actionItems inline on a wide
 *                                 screen and collapses to "..." otherwise
 */
const DataTable = (props) => {
  const {
    loading = true,
    variant = 'horizon',
    rows = [],
    sort = {},
    actions = null,
    actionItems = null,
    actionMode = 'auto',
    actionWidth = '',
    borderColor: borderColorProp,
    stickyBg: stickyBgProp,
    leftSticky = 0,
    rightSticky = 0,
    stickyHeader = false,
    maxHeight,
    isShadow = false,
    errText = '',
    disableKey = 0,
    highlightKey = 0,
    highlightKeys,
    highlightColor,
    highlightBg,
    skeletons = 3,
    resizable = false,
    view = 'auto',
    cardColumns,
    onSortChange,
    onRowClick,
  } = props;

  const cardBg = useColorModeValue('white', 'navy.700');
  const cardShadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
    '14px 17px 40px 4px rgba(12, 44, 55, 0.18)'
  );
  const themeBorder = useColorModeValue('secondaryGray.100', 'whiteAlpha.100');
  const themeStickyBg = useColorModeValue('white', 'navy.700');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const mutedColor = useColorModeValue('secondaryGray.700', 'secondaryGray.500');
  const hoverBg = useColorModeValue('secondaryGray.300', 'whiteAlpha.50');
  const brandColor = useColorModeValue('brand.500', 'brand.400');
  const defaultHighlightBg = useColorModeValue('#F2EFFF', 'whiteAlpha.100');

  const borderColor = borderColorProp || themeBorder;
  const stickyBg = stickyBgProp || themeStickyBg;

  const headers = useMemo(() => props.headers || [], [props.headers]);

  /* ---------------- column widths and resizing ---------------- */

  // Keyed by column key rather than index so a header list that changes
  // shape does not carry a stale width onto a different column.
  const [widthOverrides, setWidthOverrides] = useState({});

  // A header list swap means the old overrides describe columns that may
  // no longer exist; start clean rather than half-applying them.
  const headerSignature = headers.map((h) => h.key).join('|');
  useEffect(() => { setWidthOverrides({}); }, [headerSignature]);

  const colWidths = useMemo(
    () => headers.map((h) => {
      const override = widthOverrides[h.key];
      return override === undefined ? toPx(h.width) : override;
    }),
    [headers, widthOverrides]
  );

  const actionPixels = toPx(actionWidth, 0);

  // Sticky offsets have to be derived from the CURRENT widths, not the
  // declared ones - resize a frozen column and every column pinned after
  // it must shift by the same amount or they overlap.
  const offsets = useMemo(() => {
    const left = [];
    const right = [];
    let runningLeft = 0;
    for (let i = 0; i < colWidths.length; i += 1) {
      left.push(runningLeft);
      runningLeft += colWidths[i];
    }
    let runningRight = 0;
    for (let i = colWidths.length - 1; i >= 0; i -= 1) {
      right[i] = runningRight;
      runningRight += colWidths[i];
    }
    return { left, right };
  }, [colWidths]);

  const fieldCount = headers.length + (actions || actionItems ? 1 : 0);

  const isLeftFrozen = (index) => index < leftSticky;
  const isRightFrozen = (index) => fieldCount - index <= rightSticky;
  const isFrozen = (index) => isLeftFrozen(index) || isRightFrozen(index);

  // The drag is tracked in a ref so the move handler is not rebound on
  // every pixel of travel.
  const dragRef = useRef(null);

  const onResizeMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    const next = Math.max(MIN_COL_WIDTH, drag.startWidth + delta);
    setWidthOverrides((prev) => Object.assign({}, prev, { [drag.key]: next }));
  }, []);

  const onResizeEnd = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
  }, [onResizeMove]);

  const onResizeStart = (event, header, index) => {
    event.preventDefault();
    event.stopPropagation();   // a handle inside a sortable Th must not sort
    dragRef.current = {
      key: header.key,
      startX: event.clientX,
      startWidth: colWidths[index],
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  };

  useEffect(() => onResizeEnd, [onResizeEnd]);

  const resetWidth = (event, header) => {
    event.stopPropagation();
    setWidthOverrides((prev) => {
      const next = Object.assign({}, prev);
      delete next[header.key];
      return next;
    });
  };

  /* ---------------- sorting ---------------- */

  const onSort = (header) => {
    if (!header.sortable || !onSortChange) return;

    const sortKey = header.sort_key || header.key;
    onSortChange(sortKey === sort.key
      ? { key: sortKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key: sortKey, dir: 'asc' });
  };

  const sortToken = `${sort.key || ''}:${sort.dir || ''}`;

  const sortIcon = (header) => {
    if ((header.sort_key || header.key) !== sort.key) {
      return <ArrowUpDownIcon w="10px" h="10px" opacity={0.5} />;
    }
    return sort.dir === 'asc'
      ? <ChevronUpIcon w="14px" h="14px" color={brandColor} />
      : <ChevronDownIcon w="14px" h="14px" color={brandColor} />;
  };

  /* ---------------- highlighting ---------------- */

  // highlightKey (single) is the original prop and still works;
  // highlightKeys takes an array. Both are compared as text so a numeric
  // pk from the API matches a string key.
  const highlightSet = useMemo(() => {
    const list = []
      .concat(Array.isArray(highlightKeys) ? highlightKeys : [])
      .concat(highlightKey ? [highlightKey] : []);
    return new Set(list.map(String));
  }, [highlightKeys, highlightKey]);

  const isHighlighted = (row) => highlightSet.has(String(row.key));

  /* ---------------- actions ---------------- */

  const compact = useBreakpointValue({ base: true, xl: false });
  const collapseActions = actionMode === 'menu' || (actionMode === 'auto' && !!compact);

  const renderActionMenu = (row) => {
    const items = (actionItems(row) || []).filter(Boolean);
    if (!items.length) return null;

    return (
      <Menu placement="bottom-end" isLazy>
        <MenuButton
          as={IconButton}
          aria-label={getLangText('TABLE_MORE_ACTIONS')}
          variant="no-hover"
          bg="transparent"
          _hover={{ bg: hoverBg }}
          borderRadius="10px"
          size="sm"
          minW="32px"
          h="32px"
          onClick={(e) => e.stopPropagation()}
          icon={<Text fontSize="18px" lineHeight="1" color={mutedColor}>&#8943;</Text>}
        />
        <MenuList minW="180px" borderRadius="16px" py="6px" zIndex={20}>
          {items.map((item, index) => (
            <React.Fragment key={`ai-${index}`}>
              {item.divider ? <MenuDivider /> : null}
              <MenuItem
                icon={item.icon}
                isDisabled={item.isDisabled}
                color={item.isDanger ? 'red.500' : textColor}
                fontSize="sm"
                borderRadius="10px"
                mx="6px"
                w="auto"
                onClick={(e) => { e.stopPropagation(); item.onClick(row); }}
              >
                {item.label}
              </MenuItem>
            </React.Fragment>
          ))}
        </MenuList>
      </Menu>
    );
  };

  const renderActionInline = (row) => {
    const items = (actionItems(row) || []).filter(Boolean);
    if (!items.length) return null;

    return (
      <Flex align="center" justify="center" gridGap="6px">
        {items.filter((i) => !i.divider).map((item, index) => (
          <Button
            key={`ab-${index}`}
            size="sm"
            variant={item.isDanger ? 'danger' : 'light'}
            borderRadius="10px"
            fontSize="xs"
            leftIcon={item.icon}
            isDisabled={item.isDisabled}
            onClick={(e) => { e.stopPropagation(); item.onClick(row); }}
          >
            {item.label}
          </Button>
        ))}
      </Flex>
    );
  };

  /** One entry point so table and card render actions identically. */
  const renderActions = (row) => {
    if (actions) return actions(row, String(row.key) === String(disableKey));
    if (!actionItems) return null;
    return collapseActions ? renderActionMenu(row) : renderActionInline(row);
  };

  const hasActions = !!actions || !!actionItems;

  /* ---------------- card view ---------------- */

  /*
   * Conventional defaults.
   *
   * A card needs three roles a column list does not describe: which field
   * is the headline, which is the status chip, and which is the timestamp
   * in the footer. Tagging all of them by hand across two dozen pages is
   * a lot of edits for information the existing key names already carry,
   * so these conventions fill them in:
   *
   *   key 'no'                    dropped - a row number means nothing
   *                               once the row is a card
   *   *_at, date_time, *_time     footer
   *   status_field, state_field,
   *   license_field, *_status     the status chip
   *   first remaining column      the headline
   *
   * They apply ONLY when a header list tags nothing itself. Set any one
   * of cardTitle / cardTag / cardFooter / hideOnCard on any header and
   * the whole list is taken as hand-tagged and used verbatim.
   */
  const hasExplicitCardHints = headers.some(
    (h) => h.cardTitle || h.cardTag || h.cardFooter || h.hideOnCard
  );

  const isConventionalFooter = (key) => /(_at|_time|date_time)$/.test(key);
  const isConventionalTag = (key) =>
    key === 'status_field' || key === 'state_field' || key === 'license_field' ||
    /_status(_field)?$/.test(key);

  const decorate = (header) => {
    if (hasExplicitCardHints) return header;
    if (header.key === 'no') return Object.assign({}, header, { hideOnCard: true });
    if (isConventionalTag(header.key)) return Object.assign({}, header, { cardTag: true });
    if (isConventionalFooter(header.key)) return Object.assign({}, header, { cardFooter: true });
    return header;
  };

  const decorated = useMemo(
    () => headers.map(decorate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [headers, hasExplicitCardHints]
  );

  const cardHeaders = decorated.filter((h) => !h.hideOnCard);
  const titleHeader = cardHeaders.find((h) => h.cardTitle) || cardHeaders[0];
  // Only the first tag-ish column becomes the chip; any others fall
  // through to the body grid rather than stacking in the corner.
  const tagHeader = cardHeaders.find((h) => h.cardTag);
  const footerHeaders = cardHeaders.filter((h) => h.cardFooter);
  const bodyHeaders = cardHeaders.filter(
    (h) => h !== titleHeader && h !== tagHeader && !h.cardFooter
  );
  const sortableHeaders = headers.filter((h) => h.sortable);

  /** Card view has no column headings to click, so sorting gets a menu. */
  const renderSortBar = () => {
    if (!sortableHeaders.length || !onSortChange) return null;
    const current = sortableHeaders.find((h) => (h.sort_key || h.key) === sort.key);

    return (
      <Flex justify="flex-end" mb="12px">
        <Menu isLazy>
          <MenuButton
            as={Button}
            size="sm"
            variant="light"
            borderRadius="12px"
            fontSize="xs"
            rightIcon={
              !current ? <ArrowUpDownIcon w="10px" h="10px" />
                : sort.dir === 'asc' ? <ChevronUpIcon /> : <ChevronDownIcon />
            }
          >
            {current ? current.name : getLangText('TEXT_SORT')}
          </MenuButton>
          <MenuList zIndex={20} borderRadius="16px" py="6px" minW="180px">
            {sortableHeaders.map((header, index) => (
              <MenuItem
                key={`sort-${index}`}
                onClick={() => onSort(header)}
                fontSize="sm"
                borderRadius="10px"
                mx="6px"
                w="auto"
                fontWeight={header === current ? '700' : '500'}
                color={header === current ? brandColor : textColor}
              >
                {header.name}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      </Flex>
    );
  };

  const renderCardField = (header, row, index) => {
    const value = row[header.key];
    if (isEmptyValue(value)) return null;

    return (
      <Box
        key={`cf-${index}`}
        gridColumn={header.cardSpan === 2 ? 'span 2' : 'auto'}
        minW="0"
      >
        <Text fontSize="11px" fontWeight="500" color={mutedColor} mb="2px" noOfLines={1}>
          {header.name}
        </Text>
        <Box fontSize="sm" fontWeight="500" color={textColor} wordBreak="break-word">
          {value}
        </Box>
      </Box>
    );
  };

  const renderCard = (row, rowIndex) => {
    const highlighted = isHighlighted(row);

    return (
      <Box
        key={`card-${rowIndex}`}
        bg={highlighted ? (highlightBg || defaultHighlightBg) : cardBg}
        boxShadow={cardShadow}
        borderRadius="20px"
        borderWidth={highlighted ? '1px' : '0'}
        borderColor={highlighted ? (highlightColor || brandColor) : 'transparent'}
        px="20px"
        py="16px"
        cursor={onRowClick ? 'pointer' : 'default'}
        transition="box-shadow .18s ease, transform .18s ease"
        _hover={onRowClick ? { transform: 'translateY(-2px)' } : undefined}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
      >
        {/* headline + status */}
        <Flex align="flex-start" justify="space-between" gridGap="10px" mb="14px">
          <Box minW="0">
            {titleHeader ? (
              <>
                <Text fontSize="11px" fontWeight="500" color={mutedColor} mb="2px">
                  {titleHeader.name}
                </Text>
                <Box
                  fontSize="md" fontWeight="700"
                  color={highlighted ? (highlightColor || brandColor) : textColor}
                  wordBreak="break-word"
                >
                  {isEmptyValue(row[titleHeader.key]) ? '-' : row[titleHeader.key]}
                </Box>
              </>
            ) : null}
          </Box>

          <Flex align="center" gridGap="6px" flexShrink={0}>
            {tagHeader ? <Box>{row[tagHeader.key]}</Box> : null}
            {hasActions ? renderActions(row) : null}
          </Flex>
        </Flex>

        {/* label / value grid */}
        {bodyHeaders.length ? (
          <Grid
            templateColumns={cardColumns || { base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }}
            gridGap="12px"
          >
            {bodyHeaders.map((header, index) => renderCardField(header, row, index))}
          </Grid>
        ) : null}

        {/* footer strip */}
        {footerHeaders.length ? (
          <Flex
            align="center" justify="space-between" gridGap="10px"
            mt="14px" pt="12px" borderTopWidth="1px" borderColor={borderColor}
          >
            {footerHeaders.map((header, index) => (
              <Flex key={`cft-${index}`} align="center" gridGap="6px" minW="0">
                <Text fontSize="11px" color={mutedColor}>{header.name}</Text>
                <Box fontSize="xs" fontWeight="500" color={textColor} noOfLines={1}>
                  {isEmptyValue(row[header.key]) ? '-' : row[header.key]}
                </Box>
              </Flex>
            ))}
          </Flex>
        ) : null}
      </Box>
    );
  };

  const renderCardMessage = (text) => (
    <Box
      bg={cardBg} boxShadow={cardShadow} borderRadius="20px"
      py="48px" textAlign="center" fontSize="sm" color={mutedColor}
    >
      {text}
    </Box>
  );

  const renderCards = () => {
    if (loading) {
      return (
        <Stack spacing="16px">
          {Array.from({ length: skeletons }).map((_, index) => (
            <Box
              key={`card-skeleton-${index}`}
              bg={cardBg} boxShadow={cardShadow} borderRadius="20px"
              px="20px" py="16px"
            >
              <Flex justify="space-between" mb="14px" gridGap="10px">
                <Skeleton height="20px" width="45%" borderRadius="8px" />
                <Skeleton height="20px" width="70px" borderRadius="8px" />
              </Flex>
              <SkeletonText noOfLines={3} spacing="10px" skeletonHeight="12px" />
            </Box>
          ))}
        </Stack>
      );
    }
    if (errText) return renderCardMessage(errText);
    if (!rows.length) return renderCardMessage(getLangText('TEXT_NO_CONTENT'));

    return (
      <>
        {renderSortBar()}
        <Stack spacing="16px" key={sortToken} animation={`${sortFade} .28s ease`}>
          {rows.map((row, rowIndex) => renderCard(row, rowIndex))}
        </Stack>
      </>
    );
  };

  /* ---------------- table view ---------------- */

  const frozenShadow = (index) => {
    if (!isShadow) return undefined;
    if (leftSticky > 0 && index === leftSticky - 1) {
      return 'inset -10px 0 8px -8px rgba(0,0,0,.15)';
    }
    if (isRightFrozen(index)) {
      return 'inset 10px 0 8px -8px rgba(0,0,0,.15)';
    }
    return undefined;
  };

  // A frozen column and a frozen header both need to sit above ordinary
  // cells, and their intersection above both, or the header scrolls out
  // from under the pinned column.
  const zFor = (index, isHeaderCell) => {
    if (isHeaderCell && isFrozen(index)) return 4;
    if (isHeaderCell) return 3;
    if (isFrozen(index)) return 2;
    return 0;
  };

  const renderLoadingRows = () => (
    Array.from({ length: skeletons }).map((_, rowIndex) => (
      <Tr key={`tr-skel-${rowIndex}`}>
        {headers.map((header, colIndex) => (
          <Td key={`td-skel-${colIndex}`} borderColor={borderColor}>
            <Skeleton height="16px" borderRadius="6px" />
          </Td>
        ))}
        {hasActions ? (
          <Td borderColor={borderColor}>
            <Skeleton height="16px" borderRadius="6px" />
          </Td>
        ) : null}
      </Tr>
    ))
  );

  const renderMessageRow = (text) => (
    <Tr>
      <Td
        colSpan={fieldCount} textAlign="center" py="50px"
        borderColor="transparent" color={mutedColor} fontSize="sm"
      >
        {text}
      </Td>
    </Tr>
  );

  const renderTable = () => (
    <Box
      overflowX="auto"
      overflowY={maxHeight ? 'auto' : 'visible'}
      maxH={maxHeight}
      className="global-scroll-x"
    >
      <Table
        variant={variant}
        colorScheme="gray"
        size="md"
        minW="100%"
        style={{ tableLayout: 'fixed' }}
      >
        <Thead>
          <Tr>
            {headers.map((header, index) => {
              const canResize = resizable && header.resizable !== false;

              return (
                <Th
                  key={`th-${index}`}
                  w={`${colWidths[index]}px`}
                  minW={`${colWidths[index]}px`}
                  textAlign={header.thAlign || 'left'}
                  cursor={header.sortable ? 'pointer' : 'default'}
                  userSelect="none"
                  borderColor={borderColor}
                  fontFamily={getLangText('DEFAULT_FONTFAMILY')}
                  // Sticky in two axes at once: `top` freezes the header
                  // row against the scroll container, `left`/`right` keep
                  // the frozen columns pinned sideways.
                  //
                  // The fallback is `relative`, not unset: the resize
                  // handle below is absolutely positioned and needs this
                  // cell to be its containing block, or it anchors to the
                  // page and every handle stacks in one corner.
                  position={stickyHeader || isFrozen(index) ? 'sticky' : 'relative'}
                  top={stickyHeader ? 0 : undefined}
                  left={isLeftFrozen(index) ? `${offsets.left[index]}px` : undefined}
                  right={isRightFrozen(index) ? `${offsets.right[index] + actionPixels}px` : undefined}
                  zIndex={zFor(index, true)}
                  background={stickyHeader || isFrozen(index) ? stickyBg : undefined}
                  boxShadow={frozenShadow(index)}
                  onClick={() => onSort(header)}
                >
                  <Flex align="center" justify={header.thAlign === 'center' ? 'center' : 'space-between'} gridGap="6px">
                    <Text noOfLines={1}>{header.name || ''}</Text>
                    {header.sortable ? sortIcon(header) : null}
                  </Flex>

                  {canResize ? (
                    <Box
                      role="separator"
                      aria-orientation="vertical"
                      title={getLangText('TABLE_RESIZE_COLUMN')}
                      position="absolute"
                      top="0"
                      right="0"
                      h="100%"
                      w="8px"
                      cursor="col-resize"
                      // A wide invisible grab strip with a hairline drawn
                      // inside it: easy to hit, but it reads as a 1px rule.
                      _before={{
                        content: '""',
                        position: 'absolute',
                        top: '25%',
                        right: '3px',
                        height: '50%',
                        width: '2px',
                        borderRadius: '2px',
                        background: 'transparent',
                        transition: 'background .15s ease',
                      }}
                      _hover={{ _before: { background: brandColor } }}
                      onMouseDown={(e) => onResizeStart(e, header, index)}
                      onDoubleClick={(e) => resetWidth(e, header)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : null}
                </Th>
              );
            })}

            {hasActions ? (
              <Th
                textAlign="center"
                borderColor={borderColor}
                width={actionWidth || '120px'}
                position={stickyHeader || rightSticky > 0 ? 'sticky' : undefined}
                top={stickyHeader ? 0 : undefined}
                right={rightSticky > 0 ? '0' : undefined}
                zIndex={rightSticky > 0 ? 4 : 3}
                background={stickyHeader || rightSticky > 0 ? stickyBg : undefined}
                boxShadow={isShadow && rightSticky === 1 ? 'inset 10px 0 8px -8px rgba(0,0,0,.15)' : undefined}
              >
                {getLangText('TEXT_ACTION')}
              </Th>
            ) : null}
          </Tr>
        </Thead>

        <Tbody key={sortToken} animation={loading ? undefined : `${sortFade} .28s ease`}>
          {loading ? renderLoadingRows()
            : errText ? renderMessageRow(errText)
            : !rows.length ? renderMessageRow(getLangText('TEXT_NO_CONTENT'))
            : rows.map((row, rowIndex) => {
              const highlighted = isHighlighted(row);
              const rowBg = highlighted ? (highlightBg || defaultHighlightBg) : undefined;

              return (
                <Tr
                  key={`tr-${rowIndex}`}
                  bg={rowBg}
                  cursor={onRowClick ? 'pointer' : 'default'}
                  transition="background .15s ease"
                  _hover={{ bg: highlighted ? rowBg : hoverBg }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {headers.map((header, colIndex) => (
                    <Td
                      key={`td-${colIndex}`}
                      textAlign={header.tdAlign || header.thAlign || 'left'}
                      color={highlighted ? (highlightColor || brandColor) : textColor}
                      fontWeight={highlighted ? '700' : '500'}
                      borderColor={borderColor}
                      position={isFrozen(colIndex) ? 'sticky' : undefined}
                      left={isLeftFrozen(colIndex) ? `${offsets.left[colIndex]}px` : undefined}
                      right={isRightFrozen(colIndex) ? `${offsets.right[colIndex] + actionPixels}px` : undefined}
                      zIndex={zFor(colIndex, false)}
                      // A frozen cell must be opaque or the columns it
                      // slides over show through it.
                      background={isFrozen(colIndex) ? (rowBg || stickyBg) : undefined}
                      boxShadow={frozenShadow(colIndex)}
                    >
                      {header.ellipsis ? (
                        <Text noOfLines={2} textOverflow="ellipsis">{row[header.key]}</Text>
                      ) : (
                        row[header.key]
                      )}
                    </Td>
                  ))}

                  {hasActions ? (
                    <Td
                      textAlign="center"
                      borderColor={borderColor}
                      py="8px"
                      position={rightSticky > 0 ? 'sticky' : undefined}
                      right={rightSticky > 0 ? '0' : undefined}
                      zIndex={rightSticky > 0 ? 2 : 0}
                      background={rightSticky > 0 ? (rowBg || stickyBg) : undefined}
                      boxShadow={isShadow && rightSticky === 1 ? 'inset 10px 0 8px -8px rgba(0,0,0,.15)' : undefined}
                    >
                      {renderActions(row)}
                    </Td>
                  ) : null}
                </Tr>
              );
            })}
        </Tbody>
      </Table>
    </Box>
  );

  /* ---------------- view selection ---------------- */

  if (view === 'card') return <Box>{renderCards()}</Box>;
  if (view === 'table') return renderTable();

  // auto: cards on a narrow screen, the table from md up. Both are
  // rendered and toggled with display so the switch needs no JS measure
  // and does not remount on every resize.
  return (
    <>
      <Box display={{ base: 'block', md: 'none' }}>{renderCards()}</Box>
      <Box display={{ base: 'none', md: 'block' }}>{renderTable()}</Box>
    </>
  );
};

export default DataTable;
