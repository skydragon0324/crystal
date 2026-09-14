import React, { useState } from 'react';
import { Box, Button, Menu, MenuButton, MenuItem, MenuList, Text, useToast } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import useOptions from '../../hooks/useOptions';
import usePermission from '../../hooks/usePermission';
import { agencies, replenishments } from '../../api';
import { useT } from '../../i18n';
import { date, money } from '../../utils/format';

export const PAGE = '/admin/service/replenishments';

/** 0 draft, 1 submitted, 2 approved, 3 shipped, 4 received, 9 cancelled. */
const FLOW = { 0: [1, 9], 1: [2, 9], 2: [3, 9], 3: [4, 9], 4: [], 9: [] };

/**
 * Getting parts to the centres that need them.
 *
 * The only genuinely interesting moment is receipt: that is where a piece of
 * paper becomes stock, and it is the only status change on this screen that
 * writes to the ledger.  Everything before it is a document.
 *
 * Orders raised by the nightly sweep are marked automatic, because an order
 * nobody has looked at is a different thing from one somebody asked for.
 */
export default function Replenishments() {
  const t = useT();
  const toast = useToast();
  const { canWrite } = usePermission(PAGE);

  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { options: centres } = useOptions(() => agencies.options(), []);
  const { options: meta } = useOptions(() => replenishments.meta(), []);
  const statusMap = (Array.isArray(meta) ? {} : (meta || {})).status || {};

  const move = async (row, status) => {
    setBusy(true);
    try {
      await replenishments.transition(row.id, status, {});
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
      api={replenishments}
      defaultSort="requested_on"
      defaultDir="desc"
      subtitle={t('service.replenishments.receivingAnOrderIsWhat')}
      rowActions={canWrite ? (row) => {
        const allowed = FLOW[row.status] || [];
        if (!allowed.length) return null;

        return (
          <Menu placement="bottom-end">
            <MenuButton
              as={Button} size="xs" variant="ghost" rightIcon={<ChevronDownIcon />}
              isDisabled={busy}
            >
              {t('common.moveTo')}
            </MenuButton>
            <MenuList fontSize="sm">
              {allowed.map((code) => (
                <MenuItem key={code} onClick={() => move(row, code)}>
                  {statusMap[code] || code}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        );
      } : undefined}
      columns={[
        {
          key: 'order_no', label: 'Order',
          render: (row) => (
            <Box>
              <Text fontFamily="mono" fontSize="xs" fontWeight="600">{row.order_no}</Text>
              {row.is_auto && <StatusBadge value="WATCH" label={t('service.replenishments.automatic')} />}
            </Box>
          )
        },
        { key: 'agency_name', label: 'Service centre', maxW: '11.875rem' },
        { key: 'line_cnt', label: 'Lines', isNumeric: true },
        { key: 'total_cost', label: 'Cost', isNumeric: true, render: (row) => money(row.total_cost, row.currency) },
        { key: 'requested_on', label: 'Requested', render: (row) => date(row.requested_on) },
        { key: 'expected_on', label: 'Expected', render: (row) => date(row.expected_on) },
        { key: 'received_on', label: 'Received', render: (row) => date(row.received_on) },
        {
          key: 'status', label: 'Status',
          render: (row) => (
            <StatusBadge kind="replenishment" value={row.status} label={statusMap[row.status] || row.status} />
          )
        }
      ]}
      fields={[
        {
          name: 'agency_id', label: 'Service centre', type: 'select', required: true,
          options: centres.map((centre) => ({ value: centre.id, label: centre.name }))
        },
        { name: 'expected_on', label: 'Expected', type: 'date' },
        { name: 'remark', label: 'Note', type: 'textarea', span: 2 }
      ]}
    />
  );
}
