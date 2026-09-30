import React, { useState } from 'react';
import { Box, Button, Text, useToast } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import usePermission from '../../hooks/usePermission';
import { members } from '../../api';
import { useT } from '../../i18n';
import { dateTime, money, number } from '../../utils/format';

export const PAGE = '/admin/members/accounts';

/**
 * Members.
 *
 * Read-mostly on purpose.  An administrator can lock an account and answer a
 * question; there is deliberately no way to edit somebody's wallet from here,
 * because a balance is the sum of a ledger and an administrator who could set
 * it directly would break that.
 */
export default function Accounts() {
  const t = useT();
  const toast = useToast();
  const { isSuper } = usePermission(PAGE);

  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const setStatus = async (row) => {
    setBusy(true);
    try {
      await members.setStatus(row.id, row.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE');
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      setReloadKey((key) => key + 1);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrudPage
      key={reloadKey}
      page={PAGE}
      excel={'export'}
      api={members}
      defaultSort="created_at"
      defaultDir="desc"
      canRestore={false}
      canDelete={false}
      subtitle={t('members.accounts.aBalanceIsTheSum')}
      rowActions={isSuper ? (row) => (
        <Button size="xs" variant="ghost" isDisabled={busy} onClick={() => setStatus(row)}>
          {t(row.status === 'ACTIVE' ? 'Lock' : 'Unlock')}
        </Button>
      ) : undefined}
      columns={[
        {
          key: 'nickname', label: 'Member', maxW: '11.875rem',
          render: (row) => (
            <Box>
              <Text fontSize="xs" fontWeight="600" noOfLines={1}>{row.nickname}</Text>
              <Text fontSize="0.65rem" color="gray.500">{row.email || row.phone}</Text>
            </Box>
          )
        },
        { key: 'phone', label: 'Phone' },
        { key: 'device_cnt', label: 'Devices', isNumeric: true },
        { key: 'ticket_cnt', label: 'Repairs', isNumeric: true },
        { key: 'point_balance', label: 'Points', isNumeric: true, render: (row) => number(row.point_balance) },
        { key: 'balance', label: 'Wallet', isNumeric: true, render: (row) => money(row.balance) },
        { key: 'last_login_at', label: 'Last seen', render: (row) => dateTime(row.last_login_at) },
        { key: 'created_at', label: 'Joined', render: (row) => dateTime(row.created_at) },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
      ]}
    />
  );
}
