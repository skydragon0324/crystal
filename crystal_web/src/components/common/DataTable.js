import React from 'react';
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
  Tr
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';
import EmptyState from './EmptyState';
import Pagination from './Pagination';

/**
 * The account area's table.
 *
 * Columns are `{ key, label, render, sortKey, align, width, hideOnCard }` and
 * `render(row, number)` returns whatever belongs in the cell. `number` is the
 * row's position in the WHOLE list, not on this page: a numbered column that
 * restarts at 1 on page two is worse than no numbers at all, and working it
 * out needs the page and the page size, which the table has and a column
 * does not.
 *
 * Sorting is SERVER-side - `sortKey` names an API field, because the table
 * holds one page and sorting twenty of two hundred rows is a lie.
 *
 * Below `md` the rows become cards. That is a PHONE treatment, not a
 * narrow-window one: a six-column transaction table cannot be read on a
 * phone however it scrolls.
 */
export default function DataTable({
  columns,
  rows,
  loading,
  meta,
  sortKey,
  sortDir,
  onSort,
  onPage,
  rowKey,
  onRowClick,
  emptyTitle,
  emptyHint,
  emptyActionLabel,
  emptyActionTo,
  skeletonRows
}) {
  const t = useT();
  const surface = useSurface();
  const visible = (columns || []).filter(Boolean);
  const keyFor = (row, index) => (rowKey ? rowKey(row) : row.id !== undefined ? row.id : index);

  /* One-based, and continuing across pages - see the note above. */
  const numberOf = (index) => {
    const page = (meta && meta.page) || 1;
    const limit = (meta && meta.limit) || (rows || []).length;
    return ((page - 1) * limit) + index + 1;
  };

  const headerCell = (column) => {
    const sortable = !!column.sortKey && !!onSort;
    const active = sortable && sortKey === column.sortKey;
    return (
      <Th
        key={column.key}
        width={column.width}
        textAlign={column.align || 'left'}
        whiteSpace="nowrap"
        cursor={sortable ? 'pointer' : 'default'}
        userSelect="none"
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
        >
          {t(column.label)}
          {active && (
            <Box as={sortDir === 'asc' ? ChevronUpIcon : ChevronDownIcon} boxSize="4" />
          )}
        </Flex>
      </Th>
    );
  };

  const isEmpty = !loading && (!rows || rows.length === 0);

  return (
    <Box>
      <Box display={{ base: 'none', md: 'block' }} overflowX="auto">
        <Table size="sm">
          <Thead>
            <Tr>{visible.map(headerCell)}</Tr>
          </Thead>
          <Tbody>
            {loading &&
              Array.from({ length: skeletonRows || 6 }).map((ignored, index) => (
                <Tr key={`skeleton-${index}`}>
                  {visible.map((column) => (
                    <Td key={column.key}>
                      <Skeleton height="14px" borderRadius="6px" />
                    </Td>
                  ))}
                </Tr>
              ))}

            {!loading &&
              (rows || []).map((row, index) => (
                <Tr
                  key={keyFor(row, index)}
                  cursor={onRowClick ? 'pointer' : 'default'}
                  _hover={onRowClick ? { bg: surface.hover } : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visible.map((column) => (
                    <Td key={column.key} textAlign={column.align || 'left'}>
                      {column.render ? column.render(row, numberOf(index)) : row[column.key]}
                    </Td>
                  ))}
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
          py={12}
        />
      )}

      <Pagination meta={meta} onPage={onPage} />
    </Box>
  );
}
