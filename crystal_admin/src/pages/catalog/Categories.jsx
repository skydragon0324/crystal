import React from 'react';
import CrudPage from '../../components/CrudPage';
import SectionHero from '../../components/SectionHero';
import StatusBadge from '../../components/StatusBadge';
import { categories } from '../../api';
import usePermission from '../../hooks/usePermission';
import { useT } from '../../i18n';

export const PAGE = '/admin/catalog/categories';

/**
 * The sections of the website.
 *
 * `type` is what splits them - the smartphone landing page reads
 * type = SMARTPHONE and Eproducts reads the rest - so renaming a category is
 * safe and changing its type moves a whole section of the storefront.
 */
export default function Categories() {
  const t = useT();
  const { canWrite } = usePermission(PAGE);

  return (
    <CrudPage
      page={PAGE}
      excel={true}
      api={categories}
      defaultSort="sort_order"
      subtitle={t('catalog.categories.typeDecidesWhichStorefrontSection')}
      /*
       * Expanding a row edits that section's HERO RUN - the advertising
       * images at the top of its landing page. They live here rather than in
       * the media library because the library asks for an owner type and an
       * owner id, which nobody should need to know to change a banner.
       */
      rowHint={t('catalog.categories.expandARowToEdit')}
      renderExpanded={(row) => <SectionHero category={row} canWrite={canWrite} />}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'slug', label: 'Slug' },
        { key: 'type', label: 'Type' },
        { key: 'sort_order', label: 'Order', isNumeric: true },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'slug', label: 'Slug', required: true },
        {
          name: 'type', label: 'Type', type: 'select', required: true,
          options: ['SMARTPHONE', 'TV', 'STB', 'COMPUTER', 'CAMERA']
            .map((code) => ({ value: code, label: code }))
        },
        { name: 'icon', label: 'Icon', type: 'image', folder: 'categories' },
        { name: 'sort_order', label: 'Order', type: 'number' },
        { name: 'description', label: 'Description', type: 'textarea', span: 2 }
      ]}
    />
  );
}
