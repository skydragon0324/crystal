import React from 'react';
import { Text } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { pages } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/management/pages';

/**
 * Every screen the console has, registered.
 *
 * This list and the route table are two halves of one thing: a route whose
 * row is missing is refused by the API with a 500 that says so, deliberately,
 * rather than with a 403 that would send somebody asking for a permission
 * which does not exist.
 */
export default function Pages() {
  const t = useT();
  const { options: pageList } = useOptions(() => pages.list({ limit: 200 }), []);

  return (
    <CrudPage
      page={PAGE}
      api={pages}
      defaultSort="sort_order"
      canRestore={false}
      subtitle={t('management.pages.aRouteWithNoRow')}
      columns={[
        {
          key: 'page_url', label: 'Route',
          render: (row) => <Text fontFamily="mono" fontSize="xs">{row.page_url}</Text>
        },
        { key: 'page_name', label: 'Name' },
        { key: 'icon', label: 'Icon' },
        { key: 'sort_order', label: 'Order', isNumeric: true },
        {
          key: 'is_menu', label: 'In the sidebar',
          render: (row) => (
            row.is_menu
              ? <StatusBadge value="OK" label={t('common.yes')} />
              : <StatusBadge value="CLOSED" label={t('management.pages.guardedOnly')} />
          )
        }
      ]}
      fields={[
        { name: 'page_url', label: 'Route', required: true, span: 2 },
        { name: 'page_name', label: 'Name', required: true },
        { name: 'icon', label: 'Icon', placeholder: 'a react-icons Md name' },
        {
          name: 'parent_id', label: 'Sits under', type: 'select',
          placeholder: 'a top level group',
          options: pageList
            .filter((row) => !row.parent_id)
            .map((row) => ({ value: row.id, label: row.page_name }))
        },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'is_menu', label: 'Show in the sidebar', type: 'checkbox', span: 2 }
      ]}
    />
  );
}
