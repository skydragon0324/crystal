import React from 'react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import { osVersions } from '../../api';
import { useT } from '../../i18n';
import { date } from '../../utils/format';

export const PAGE = '/admin/catalog/os';

/**
 * Crystal OS releases.
 *
 * Which handsets have received a version is edited on the product, not here:
 * a version reaches the C9 in March and the C5 in June, so the date belongs
 * on the pairing rather than on the release.
 */
export default function Os() {
  const t = useT();

  return (
    <CrudPage
      page={PAGE}
      excel={true}
      api={osVersions}
      defaultSort="release_date"
      defaultDir="desc"
      subtitle={t('catalog.os.whichHandsetsHaveReceivedA')}
      columns={[
        { key: 'version', label: 'Version' },
        { key: 'title', label: 'Title', maxW: '16.25rem' },
        { key: 'release_date', label: 'Released', render: (row) => date(row.release_date) },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
      fields={[
        { name: 'version', label: 'Version', required: true },
        { name: 'title', label: 'Title', required: true },
        { name: 'release_date', label: 'Released', type: 'date' },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }]
        },
        { name: 'cover_image', label: 'Cover image', type: 'image', folder: 'os', span: 2 },
        { name: 'highlights', label: 'Highlights (one per line)', type: 'textarea', span: 2 },
        { name: 'description', label: 'Description', type: 'textarea', span: 2 }
      ]}
    />
  );
}
