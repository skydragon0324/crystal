import React, { useState } from 'react';
import { Box, Button, Text, useDisclosure, useToast } from '@chakra-ui/react';

import CrudPage from '../../components/CrudPage';
import StatusBadge from '../../components/StatusBadge';
import FormModal from '../../components/FormModal';
import usePermission from '../../hooks/usePermission';
import { warranties } from '../../api';
import { useT } from '../../i18n';
import { date, money, number } from '../../utils/format';

export const PAGE = '/admin/service/warranties';

/**
 * Cover, as it was actually sold.
 *
 * Voiding is not deleting and has its own button for that reason: a voided
 * warranty stays on the device's history with its reason attached, because "I
 * was told I was covered" is a question asked months later and cannot be
 * answered from a row that is gone.
 */
export default function Warranties() {
  const t = useT();
  const toast = useToast();
  const { isSuper } = usePermission(PAGE);

  const voidForm = useDisclosure();
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const voidCover = async (payload) => {
    setBusy(true);
    try {
      await warranties.voidCover(target.id, payload.void_reason);
      voidForm.onClose();
      toast({ status: 'success', description: t('common.saved'), duration: 2500 });
      setReloadKey((key) => key + 1);
    } catch (err) {
      toast({ status: 'error', description: err.message, duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <CrudPage
        key={reloadKey}
        page={PAGE}
        api={warranties}
        defaultSort="end_date"
        defaultDir="asc"
        subtitle={t('service.warranties.coverIsIssuedWhenA')}
        filters={[]}
        rowActions={isSuper ? (row) => (
          row.status === 'VOID' ? null : (
            <Button
              size="xs"
              variant="ghost"
              colorScheme="red"
              onClick={() => { setTarget(row); voidForm.onOpen(); }}
            >
              {t('service.warranties.void')}
            </Button>
          )
        ) : undefined}
        columns={[
          {
            key: 'warranty_no', label: 'Warranty',
            render: (row) => <Text fontFamily="mono" fontSize="xs" fontWeight="600">{row.warranty_no}</Text>
          },
          {
            key: 'serial_number', label: 'Device', maxW: '12.5rem',
            render: (row) => (
              <Box>
                <Text fontSize="xs" noOfLines={1}>{row.product_name || '-'}</Text>
                <Text fontSize="0.65rem" fontFamily="mono" color="gray.500">{row.serial_number}</Text>
              </Box>
            )
          },
          { key: 'member_nickname', label: 'Member', maxW: '9.375rem' },
          { key: 'kind', label: 'Kind' },
          { key: 'start_date', label: 'From', render: (row) => date(row.start_date) },
          {
            key: 'end_date', label: 'Until',
            render: (row) => (
              <Box>
                <Text fontSize="xs">{date(row.end_date)}</Text>
                {row.in_force && Number(row.days_to_expiry) <= 60 && (
                  <Text fontSize="0.65rem" color="orange.400">
                    {t('service.warranties.daysLeft', { n: number(row.days_to_expiry) })}
                  </Text>
                )}
              </Box>
            )
          },
          {
            key: 'claims_used', label: 'Claims', isNumeric: true,
            render: (row) => row.claims_used + (row.claim_limit ? ' / ' + row.claim_limit : '')
          },
          { key: 'price_paid', label: 'Paid', isNumeric: true, render: (row) => money(row.price_paid) },
          {
            key: 'status', label: 'Status',
            render: (row) => (
              <Box>
                <StatusBadge value={row.status} />
                {row.void_reason && (
                  <Text fontSize="0.62rem" color="red.400" noOfLines={1} maxW="9.375rem">
                    {row.void_reason}
                  </Text>
                )}
              </Box>
            )
          }
        ]}
      />

      <FormModal
        isOpen={voidForm.isOpen}
        onClose={voidForm.onClose}
        onSubmit={voidCover}
        isLoading={busy}
        columns={1}
        title={t('service.warranties.void') + (target ? ' ' + target.warranty_no : '')}
        fields={[{
          name: 'void_reason', label: 'Why it is being voided', type: 'textarea', required: true,
          placeholder: t('service.warranties.keptOnTheDeviceHistory')
        }]}
      />
    </Box>
  );
}
