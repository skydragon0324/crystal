import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Box, Button, useDisclosure, useToast } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime, money, number } from '../../utils/format';
import { Status, choices, filtersFor, optionsFrom, useCrmMeta, word } from './shared';

export const PAGE = '/admin/crm/campaigns';

export const CAMPAIGN_TYPES = ['PROMOTION', 'RETENTION', 'WIN_BACK', 'PRODUCT_LAUNCH', 'SERVICE', 'EVENT_NOTICE', 'SURVEY'];

/**
 * CAMPAIGNS - who is to be told what, on which channel, and whether they may be.
 *
 * A campaign is approved by a second manager, freezes its audience, and
 * prepares each message by checking, member by member, that the customer
 * agreed to hear about this on this channel and has somewhere to receive it.
 * The console prepares; a message gateway sends. Costs and outcomes are kept
 * against the campaign so what it achieved can be read against what it cost.
 */
export default function Campaigns() {
  const translate = useT();
  const toast = useToast();
  const history = useHistory();
  const meta = useCrmMeta();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);

  const list = useList((params) => crm.campaigns.list(params), { page: 1, limit: 20, dir: 'desc' });

  const create = async (values) => {
    setSaving(true);
    try {
      const { data } = await crm.campaigns.create(values);
      toast({ title: translate('Created'), status: 'success', duration: 2500 });
      form.onClose();
      if (data && data.campaign_id) history.push(PAGE + '/' + data.campaign_id);
      else list.reload();
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card bodyProps={false}>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'campaign_status', label: 'Status', value: list.params.campaign_status,
            options: choices(['DRAFT', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
            onChange: (value) => list.setFilter({ campaign_status: value || undefined }) },
          { key: 'campaign_type', label: 'Type', value: list.params.campaign_type, options: choices(CAMPAIGN_TYPES),
            onChange: (value) => list.setFilter({ campaign_type: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={form.onOpen}>
            {translate('crm.campaigns.newCampaign')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'campaign_code', label: 'Code' },
            { key: 'campaign_name', label: 'Campaign', maxW: '16rem' },
            { key: 'campaign_type', label: 'Type', render: (row) => word(translate, row.campaign_type) },
            { key: 'project_code', label: 'Project' },
            { key: 'owner_name', label: 'Owner' },
            { key: 'audience_cnt', label: 'Audience', isNumeric: true, render: (row) => number(row.audience_cnt) },
            { key: 'cost_total', label: 'Cost', isNumeric: true, render: (row) => money(row.cost_total) },
            { key: 'start_at', label: 'Starts', render: (row) => dateTime(row.start_at) },
            { key: 'campaign_status', label: 'Status', render: (row) => <Status value={row.campaign_status} /> }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.campaign_id || row.id}
          onRowClick={(row) => history.push(PAGE + '/' + (row.campaign_id || row.id))}
          storageKey={PAGE}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.campaigns.newCampaign')}
        initial={{ campaign_type: 'PROMOTION' }}
        onSubmit={create}
        saving={saving}
        fields={[
          { name: 'campaign_code', label: 'Code', required: true },
          { name: 'campaign_name', label: 'Campaign', required: true },
          { name: 'campaign_type', label: 'Type', type: 'select', required: true, isClearable: false, options: choices(CAMPAIGN_TYPES) },
          { name: 'project_id', label: 'Project', type: 'select', options: optionsFrom(meta.projects, 'project_id', 'project_name'),
            help: 'Consent is checked against this project. Left empty, the platform\'s consent is used.' },
          { name: 'start_at', label: 'Starts', type: 'datetime-local' },
          { name: 'end_at', label: 'Ends', type: 'datetime-local' },
          { name: 'description', label: 'Description', type: 'textarea', colSpan: 'full' }
        ]}
      />
    </Card>
  );
}
