import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import { members } from '../../api';
import { useT } from '../../i18n';
import { date, dateTime, number } from '../../utils/format';

export const PAGE = '/admin/members/registrations';

/**
 * Every device a member has registered.
 *
 * A serial number can only ever be registered once - that unique index is the
 * actual guard against a serial being farmed for points - and registering one
 * is also what ISSUES the warranty, which is why cover shows up here.
 */
export default function Registrations() {
  const t = useT();

  const api = {
    list: (params) => members.registrations(params)
  };

  return (
    <CrudPage
      page={PAGE}
      api={api}
      defaultSort="register_time"
      defaultDir="desc"
      canRestore={false}
      canDelete={false}
      searchable={false}
      subtitle={t('members.registrations.registeringADeviceIsWhat')}
      columns={[
        {
          key: 'serial_number', label: 'Device', maxW: '13.125rem',
          render: (row) => (
            <Box>
              <Text fontSize="xs" noOfLines={1}>{row.product_name || '-'}</Text>
              <Text fontSize="0.65rem" fontFamily="mono" color="gray.500">{row.serial_number}</Text>
            </Box>
          )
        },
        { key: 'nickname', label: 'Nickname', maxW: '10rem' },
        { key: 'category_name', label: 'Section' },
        { key: 'purchase_date', label: 'Bought', render: (row) => date(row.purchase_date) },
        {
          key: 'cover_until', label: 'Covered until',
          render: (row) => (
            row.cover_until
              ? <Text fontSize="xs">{date(row.cover_until)}</Text>
              : <StatusBadge value="EXPIRED" label={t('members.registrations.noCover')} />
          )
        },
        { key: 'repair_cnt', label: 'Repairs', isNumeric: true },
        { key: 'points', label: 'Points awarded', isNumeric: true, render: (row) => number(row.points) },
        { key: 'register_time', label: 'Registered', render: (row) => dateTime(row.register_time) }
      ]}
    />
  );
}
