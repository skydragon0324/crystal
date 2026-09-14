import React from 'react';
import { Text } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import { members } from '../../api';
import { useT } from '../../i18n';
import { date, dateTime, number } from '../../utils/format';

export const PAGE = '/admin/members/licenses';

/**
 * Device licences.
 *
 * The key is derived rather than random - the same inputs always produce the
 * same key - so support can re-derive one and verify it without a lookup.
 * It is never written to the audit trail, for the same reason a password
 * hash is not.
 */
export default function Licenses() {
  const t = useT();

  const api = { list: (params) => members.licenses(params) };

  return (
    <CrudPage
      page={PAGE}
      api={api}
      defaultSort="created_at"
      defaultDir="desc"
      canRestore={false}
      canDelete={false}
      searchable={false}
      subtitle={t('members.licenses.licenceKeysAreDerivedSo')}
      columns={[
        {
          key: 'license_key', label: 'Licence key',
          render: (row) => <Text fontFamily="mono" fontSize="xs">{row.license_key}</Text>
        },
        { key: 'device_type', label: 'Device type' },
        {
          key: 'device_sn', label: 'Device',
          render: (row) => <Text fontFamily="mono" fontSize="xs">{row.device_sn}</Text>
        },
        { key: 'product_name', label: 'Product', maxW: '10.625rem' },
        { key: 'points_used', label: 'Points spent', isNumeric: true, render: (row) => number(row.points_used) },
        { key: 'valid_until', label: 'Valid until', render: (row) => date(row.valid_until) },
        { key: 'created_at', label: 'Issued', render: (row) => dateTime(row.created_at) },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
    />
  );
}
