import React from 'react';
import { Box, Grid, Text } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { categories, specDefinitions, specGroups } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/catalog/specifications';

/**
 * The specification dictionary.
 *
 * Specs are rows rather than columns, which is what makes the compare matrix
 * possible: two products line up against shared definitions without either of
 * them declaring a schema.  `compare_enabled` is the switch that keeps that
 * table readable - a comparison of eighty rows is a comparison nobody reads.
 */
export default function Specifications() {
  const t = useT();
  const { options: groups } = useOptions(() => specGroups.list({ limit: 100 }), []);
  const { options: sections } = useOptions(() => categories.options(), []);

  /*
   * "Every product", as the option that means no category.
   *
   * The column is nullable and NULL is a real, common answer - Build and In
   * the box apply everywhere - so it has to be pickable rather than only
   * reachable by clearing the field.
   */
  const sectionOptions = [{ value: null, label: 'Every product' }].concat(
    sections.map((row) => ({ value: row.id, label: row.name }))
  );

  return (
    <Grid templateColumns={{ base: '1fr', xl: '1fr 2fr' }} gap={5}>
      <Box>
        <CrudPage
          page={PAGE}
          api={specGroups}
          defaultSort="sort_order"
          title={t('catalog.specifications.groups')}
          canRestore={false}
          columns={[
            { key: 'name', label: 'Group' },
            {
              key: 'category_name', label: 'Applies to',
              render: (row) => (row.category_name
                ? <Text fontSize="xs">{row.category_name}</Text>
                : <Text fontSize="xs" color="gray.500">{t('catalog.specifications.everyProduct')}</Text>)
            },
            { key: 'code', label: 'Code' },
            { key: 'sort_order', label: 'Order', isNumeric: true }
          ]}
          fields={[
            { name: 'name', label: 'Group', required: true },
            { name: 'code', label: 'Code', required: true },
            {
              name: 'product_category_id', label: 'Applies to', type: 'select', span: 2,
              options: sectionOptions,
              help: 'A group pinned to a section is only offered for products in it. Leave it on Every product for rows every product has, like Build.'
            },
            { name: 'sort_order', label: 'Order', type: 'number', span: 2 }
          ]}
        />
      </Box>

      <Box>
        <CrudPage
          page={PAGE}
          api={specDefinitions}
          defaultSort="sort_order"
          title={t('catalog.specifications.definitions')}
          subtitle={t('catalog.specifications.onlyDefinitionsMarkedComparableAppear')}
          canRestore={false}
          columns={[
            { key: 'name', label: 'Definition', maxW: '12.5rem' },
            {
              key: 'group_name', label: 'Group',
              // The section comes from the GROUP - a definition belongs to
              // exactly one group, and that is what scopes it.
              render: (row) => (
                <Box>
                  <Text fontSize="xs">{row.group_name}</Text>
                  {row.group_category_name ? (
                    <Text fontSize="0.6rem" color="gray.500">{row.group_category_name}</Text>
                  ) : null}
                </Box>
              )
            },
            { key: 'unit', label: 'Unit' },
            {
              key: 'compare_enabled', label: 'Comparable',
              render: (row) => (row.compare_enabled ? <StatusBadge value="OK" label={t('common.yes')} /> : '-')
            },
            { key: 'sort_order', label: 'Order', isNumeric: true }
          ]}
          fields={[
            { name: 'name', label: 'Definition', required: true },
            {
              name: 'group_id', label: 'Group', type: 'select', required: true,
              options: groups.map((row) => ({ value: row.id, label: row.name }))
            },
            { name: 'unit', label: 'Unit' },
            { name: 'sort_order', label: 'Order', type: 'number' },
            { name: 'compare_enabled', label: 'Show in the compare matrix', type: 'checkbox', span: 2 }
          ]}
        />
      </Box>
    </Grid>
  );
}
