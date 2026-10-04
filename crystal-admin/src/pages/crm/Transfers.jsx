import React, { useState } from 'react';
import { Box, Button, useDisclosure, useToast } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import Toolbar from '../../components/Toolbar';
import { useConfirm } from '../../components/ConfirmDialog';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';
import { InstancePicker, PartyPicker, Status, choices, optionsFrom, useCrmMeta, useSiteOptions, word, filtersFor, partyIdLabel } from './shared';

export const PAGE = '/admin/crm/transfers';

const KINDS = ['OWNERSHIP_TRANSFER', 'ASSIGN_USER', 'END_ASSIGNMENT', 'RETURN_TO_OWNER', 'LEASE_START', 'LEASE_END', 'LICENCE_REBIND'];

/* Which kinds hand the product TO somebody, and which move a licence. */
const NEEDS_RECEIVER = ['OWNERSHIP_TRANSFER', 'ASSIGN_USER', 'LEASE_START'];

const NEXT = {
  REQUESTED: ['ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED']
};

const VERB = {
  ACCEPTED: 'crm.transfers.accept',
  COMPLETED: 'crm.transfers.complete',
  REJECTED: 'crm.transfers.reject',
  CANCELLED: 'crm.transfers.cancel'
};

/**
 * TRANSFERS AND ASSIGNMENTS - every change of hands, as a request first.
 *
 * Selling a phone to somebody, a company handing a laptop to an employee and
 * taking it back, a lease starting and ending, a licence moving to a new
 * television: each is recorded as a request, and COMPLETING it is what ends
 * the old registration and starts the new one - in one step, so a product is
 * never held by nobody or by two owners at once.
 *
 * Who it moves FROM is never typed: it is whoever holds the product that way
 * right now.
 */
export default function Transfers() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useCrmMeta();
  const sites = useSiteOptions();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);

  const list = useList((params) => crm.transfers.list(params), { page: 1, limit: 20, open: '1', dir: 'desc' });

  const request = async (values) => {
    setSaving(true);
    try {
      await crm.transfers.request(values);
      toast({ title: translate('crm.transfers.requested'), status: 'success', duration: 2500 });
      form.onClose();
      list.reload();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const move = async (row, status) => {
    const agreed = await confirm({
      tone: status === 'COMPLETED' ? 'info' : 'danger',
      title: translate(VERB[status]),
      body: translate(status === 'COMPLETED' ? 'crm.transfers.completeExplained' : 'crm.transfers.closeExplained'),
      detail: word(translate, row.transfer_kind) + '  ·  ' + (row.external_product_instance_id || ''),
      confirmLabel: translate(VERB[status])
    });
    if (!agreed) return;
    try {
      await crm.transfers.transition(row.product_transfer_id, status);
      toast({ title: translate('Saved'), status: 'success', duration: 2500 });
      list.reload();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  const actions = canWrite ? ['ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED'].map((status) => ({
    key: status,
    label: translate(VERB[status]),
    hidden: (row) => (NEXT[row.status] || []).indexOf(status) === -1,
    onClick: (row) => move(row, status)
  })) : [];

  return (
    <Card bodyProps={false}>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'open', label: 'Open or all', value: list.params.open,
            options: [{ value: '1', label: 'Open only' }],
            onChange: (value) => list.setFilter({ open: value || undefined }) },
          { key: 'transfer_kind', label: 'What', value: list.params.transfer_kind, width: '13rem',
            options: choices(KINDS), onChange: (value) => list.setFilter({ transfer_kind: value || undefined }) },
          { key: 'status', label: 'Status', value: list.params.status,
            options: choices(['REQUESTED', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={form.onOpen}>
            {translate('crm.transfers.newRequest')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'transfer_kind', label: 'What', render: (row) => word(translate, row.transfer_kind) },
            { key: 'product_name', label: 'Product' },
            { key: 'external_product_instance_id', label: 'Serial or key' },
            { key: 'from_name', label: 'From', render: (row) => (row.from_name ? row.from_name + '  ' + partyIdLabel(row.from_party_id) : '-') },
            { key: 'to_name', label: 'To', render: (row) => (row.to_name ? row.to_name + '  ' + partyIdLabel(row.to_party_id) : (row.to_instance_external_id || '-')) },
            { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> },
            { key: 'reason', label: 'Reason', maxW: '14rem' },
            { key: 'requested_at', label: 'Requested', render: (row) => dateTime(row.requested_at) },
            { key: 'completed_at', label: 'Completed', render: (row) => dateTime(row.completed_at) }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.product_transfer_id || row.id}
          actions={actions}
          actionsMode="menu"
          storageKey={PAGE}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.transfers.newRequest')}
        initial={{ transfer_kind: 'OWNERSHIP_TRANSFER' }}
        onSubmit={request}
        saving={saving}
        fields={(function () {
          return [
            { name: 'transfer_kind', label: 'What should happen', type: 'select', required: true, isClearable: false,
              options: choices(KINDS), colSpan: 'full' },
            { name: 'product_instance_id', label: 'Product', type: 'custom', required: true, colSpan: 'full',
              render: (values, set) => <InstancePicker value={values.product_instance_id} onChange={(value) => set('product_instance_id', value)} /> },
            { name: 'to_party_id', label: 'Goes to', type: 'custom', colSpan: 'full',
              help: 'Needed when the product is handed to somebody: a transfer, an assignment, a lease.',
              render: (values, set) => (
                <PartyPicker
                  value={values.to_party_id}
                  isDisabled={NEEDS_RECEIVER.indexOf(values.transfer_kind) === -1}
                  onChange={(value) => set('to_party_id', value)}
                />
              ) },
            { name: 'to_instance_id', label: 'New device for the licence', type: 'custom', colSpan: 'full',
              render: (values, set) => (values.transfer_kind === 'LICENCE_REBIND'
                ? <InstancePicker value={values.to_instance_id} onChange={(value) => set('to_instance_id', value)} />
                : null) },
            { name: 'acquisition_type_id', label: 'How it was obtained', type: 'select',
              options: optionsFrom(meta.acquisition_types, 'acquisition_type_id', 'acquisition_name') },
            { name: 'handled_at_service_center_id', label: 'Handled at service location', type: 'select', options: sites, isSearchable: true },
            { name: 'reason', label: 'Reason', type: 'textarea', colSpan: 'full' }
          ];
        }())}
      />
    </Card>
  );
}
