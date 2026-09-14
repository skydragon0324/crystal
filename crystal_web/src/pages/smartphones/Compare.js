import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  IconButton,
  Image,
  Stack,
  Switch,
  Text
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { useDispatch, useSelector } from 'react-redux';

import { EmptyState, ErrorState, Loading, Price, Section, SelectField } from '@/components/common';
import api from '@/api';
import { useApi } from '@/hooks/useApi';
import {
  MAX_COMPARE,
  MIN_COMPARE,
  clear,
  remove,
  selectCompareIds,
  selectCompareItems,
  toggle
} from '@/app/compareSlice';
import { fileUrl } from '@/api/client';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

/**
 * Compare 2-4 phones.
 *
 * The server returns the matrix already pivoted - rows are shared
 * definitions, each with one cell per product in the order they were asked
 * for, and a `differs` flag per row. Pivoting on the client would mean
 * re-implementing the alignment here and in the console, and getting it
 * subtly different.
 *
 * "Highlight differences" is a filter over `differs`, which is the question
 * anyone comparing phones is actually asking. It is on by default once there
 * is more than one product, because the identical rows are the ones nobody
 * reads.
 *
 * On a phone the grid holds TWO columns and scrolls horizontally: four
 * columns on a 390px screen gives each spec 80px, which is not a comparison.
 */
/**
 * The matrix arrives FLAT - one row per comparable definition, in group
 * order, each carrying its group's id and name.
 *
 * The grouping is rebuilt here rather than asked for as a nested payload
 * because the alignment is the part that must not be re-implemented, and that
 * is what the server already did: cell N of every row belongs to product N.
 * Splitting an ordered list into headed sections cannot get that wrong.
 */
function groupRows(rows) {
  const groups = [];
  const byId = {};

  (rows || []).forEach((row) => {
    if (!byId[row.group_id]) {
      byId[row.group_id] = { id: row.group_id, name: row.group_name, rows: [] };
      groups.push(byId[row.group_id]);
    }
    byId[row.group_id].rows.push(row);
  });

  return groups;
}

export default function Compare() {
  const t = useT();

  const surface = useSurface();
  const dispatch = useDispatch();

  const items = useSelector(selectCompareItems);
  const ids = useSelector(selectCompareIds);
  const [onlyDifferences, setOnlyDifferences] = useState(true);

  const choices = useApi(() => api.catalog.comparable('SMARTPHONE'), []);
  const matrix = useApi(
    () => (ids.length >= MIN_COMPARE ? api.catalog.compare(ids) : Promise.resolve({ data: null })),
    [ids.join(',')]
  );

  const options = (choices.data || [])
    .filter((product) => ids.indexOf(product.id) === -1)
    .map((product) => ({
      value: product.id,
      label: product.name,
      hint: product.series_name || undefined
    }));

  const addProduct = (id) => {
    const product = (choices.data || []).filter((item) => item.id === id)[0];
    if (product) dispatch(toggle(product));
  };

  const data = matrix.data;
  const groups = groupRows(data && data.rows);
  const columnCount = data ? data.products.length : items.length;

  const gridTemplate = {
    base: `140px repeat(${Math.max(columnCount, 1)}, minmax(150px, 1fr))`,
    md: `200px repeat(${Math.max(columnCount, 1)}, minmax(160px, 1fr))`
  };

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Flex
        align={{ base: 'flex-start', md: 'flex-end' }}
        justify="space-between"
        direction={{ base: 'column', md: 'row' }}
        gap="4" data-gap="16" data-gap-row-from="md"
        mb="8"
      >
        <Box>
          <Heading size="lg" letterSpacing="-0.02em" color={surface.text}>
            {t('common.comparePhones')}
          </Heading>
          <Text color={surface.muted} mt="1">
            {t('smartphones.compare.chooseHandsets', { min: MIN_COMPARE, max: MAX_COMPARE })}
          </Text>
        </Box>

        <Flex gap="3" data-gap="12" align="center" w={{ base: '100%', md: 'auto' }}>
          {items.length < MAX_COMPARE && (
            <Box minW={{ base: '100%', md: '240px' }}>
              <SelectField
                size="sm"
                value={null}
                onChange={addProduct}
                options={options}
                placeholder={t('smartphones.compare.addAPhone')}
              />
            </Box>
          )}
          {items.length > 0 && (
            <Button size="sm" variant="ghost" flexShrink={0} onClick={() => dispatch(clear())}>
              {t('common.clear')}
            </Button>
          )}
        </Flex>
      </Flex>

      {items.length < MIN_COMPARE && (
        <EmptyState
          title={
            items.length === 0
              ? 'Nothing to compare yet'
              : `Add ${MIN_COMPARE - items.length} more to compare`
          }
          hint={t('smartphones.compare.pickHandsetsFromTheDropdown')}
          actionLabel="Browse smartphones"
          actionTo="/smartphones/products"
        />
      )}

      {items.length >= MIN_COMPARE && matrix.loading && <Loading variant="block" height="480px" />}

      {items.length >= MIN_COMPARE && matrix.error && (
        <ErrorState message={matrix.error} onRetry={matrix.reload} />
      )}

      {data && (
        <>
          <Flex align="center" gap="3" data-gap="12" mb="5">
            <Switch
              colorScheme="brand"
              isChecked={onlyDifferences}
              onChange={(event) => setOnlyDifferences(event.target.checked)}
            />
            <Text fontSize="sm" color={surface.strong}>
              {t('smartphones.compare.showOnlyTheRowsThat')}
            </Text>
          </Flex>

          <Box overflowX="auto" pb="2">
            <Box minW={{ base: `${140 + columnCount * 150}px`, md: 'auto' }}>
              {/* ------------------------------------------------ the header */}
              <Grid
                templateColumns={gridTemplate}
                gap="0"
                position="sticky"
                top="0"
                bg={surface.page}
                zIndex="1"
                borderBottom="2px solid"
                borderColor={surface.border}
                pb="4"
                mb="1"
              >
                <Box />
                {data.products.map((product) => (
                  <Box key={product.id} px="3" position="relative">
                    <IconButton
                      size="xs"
                      variant="ghost"
                      position="absolute"
                      top="0"
                      right="1"
                      aria-label={`Remove ${product.name}`}
                      icon={<CloseIcon boxSize="2" />}
                      onClick={() => dispatch(remove(product.id))}
                    />
                    <Box
                      as={RouterLink}
                      to={`/smartphones/products/${product.slug}`}
                      display="block"
                    >
                      <Image
                        src={fileUrl(product.main_image)}
                        alt={product.name}
                        w="100%"
                        maxW="130px"
                        mx="auto"
                        borderRadius="10px"
                        mb="2"
                      />
                      <Text
                        fontWeight="700"
                        fontSize="sm"
                        color={surface.text}
                        textAlign="center"
                        noOfLines={2}
                      >
                        {product.name}
                      </Text>
                    </Box>
                    <Text textAlign="center" mt="1">
                      <Price amount={product.price} currency={product.currency} fontSize="sm" />
                    </Text>
                  </Box>
                ))}
              </Grid>

              {/* -------------------------------------------------- the rows */}
              {groups.map((group) => {
                const rows = onlyDifferences
                  ? group.rows.filter((row) => row.differs)
                  : group.rows;
                if (!rows.length) return null;

                return (
                  <Box key={group.id} mb="8">
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      letterSpacing="0.8px"
                      textTransform="uppercase"
                      color="brand.500"
                      py="3"
                    >
                      {group.name}
                    </Text>

                    {rows.map((row, index) => (
                      <Grid
                        key={row.definition_id}
                        templateColumns={gridTemplate}
                        gap="0"
                        py="3"
                        borderTop={index === 0 ? '1px solid' : 'none'}
                        borderBottom="1px solid"
                        borderColor={surface.border}
                        bg={row.differs && !onlyDifferences ? surface.raised : 'transparent'}
                      >
                        <Flex align="center" px="3">
                          <Text fontSize="sm" color={surface.muted}>
                            {row.name}
                            {row.unit && (
                              <Text as="span" ml="1" fontSize="xs">
                                ({row.unit})
                              </Text>
                            )}
                          </Text>
                        </Flex>

                        {row.cells.map((value, column) => (
                          <Flex key={column} align="center" px="3">
                            <Text
                              fontSize="sm"
                              color={value === null ? surface.muted : surface.text}
                              fontWeight={row.differs ? 600 : 400}
                            >
                              {/* An empty cell means this product does not
                                  declare the field - not that it is zero. */}
                              {value === null ? '—' : value}
                            </Text>
                          </Flex>
                        ))}
                      </Grid>
                    ))}
                  </Box>
                );
              })}

              {onlyDifferences &&
                groups.every((group) => group.rows.every((row) => !row.differs)) && (
                  <EmptyState
                    title={t('smartphones.compare.theseAreIdenticalOnEvery')}
                    hint={t('smartphones.compare.turnOffOnlyTheRows')}
                  />
                )}
            </Box>
          </Box>

          <Stack spacing="2" mt="8">
            <Text fontSize="xs" color={surface.muted}>
              {t('smartphones.compare.onlySpecificationsMarkedAsComparable')}
            </Text>
          </Stack>
        </>
      )}
    </Section>
  );
}
