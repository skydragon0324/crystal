import React from 'react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import { categories, series } from '../../api';
import { useT } from '../../i18n';

export const PAGE = '/admin/catalog/series';

/** The product lines - C9, C7, C5, C3 and their equivalents elsewhere. */
export default function Series() {
  const t = useT();
  const { options: sections } = useOptions(() => categories.options(), []);

  return (
    <CrudPage
      page={PAGE}
      excel={true}
      api={series}
      defaultSort="sort_order"
      subtitle={t('catalog.series.aSeriesWithNothingPublished')}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'slug', label: 'Slug' },
        { key: 'category_name', label: 'Section' },
        { key: 'sort_order', label: 'Order', isNumeric: true },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'slug', label: 'Slug', required: true },
        {
          name: 'category_id', label: 'Section', type: 'select', required: true,
          options: sections.map((row) => ({ value: row.id, label: row.name }))
        },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'banner_image', label: 'Banner (desktop)', type: 'image', folder: 'series', span: 2 },
        { name: 'banner_image_mobile', label: 'Banner (mobile)', type: 'image', folder: 'series', span: 2 },
        { name: 'description', label: 'Description', type: 'textarea', span: 2 }
      ]}
    />
  );
}
