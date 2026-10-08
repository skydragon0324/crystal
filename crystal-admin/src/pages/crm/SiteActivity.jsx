import React, { useState } from 'react';
import {
  Box, Button, Progress, Tab, TabList, TabPanel, TabPanels, Tabs, Text, useDisclosure, useToast
} from '@chakra-ui/react';
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
import { date, dateTime, money, number } from '../../utils/format';
import { PartyPicker, Status, amount, choices, dateInput, localInput, optionsFrom, useCrmMeta, useSiteOptions, word, filtersFor, partyIdLabel } from './shared';

export const PAGE = '/admin/crm/site-activity';

const EVENT_TYPES = ['PROMOTION_DAY', 'PRODUCT_LAUNCH', 'ROADSHOW', 'TRAINING', 'INSPECTION', 'EVENT_PICKUP_DAY', 'COMMUNITY_EVENT'];
const EVENT_STATUS = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/**
 * SITE ACTIVITY - what actually happens at each place, against what was meant to.
 *
 * THE LOG is one row per thing done: a repair taken in or handed back (from
 * the Crystal import), a reservation collected or a prize handed over (from a
 * event), a registration done at the counter - and whatever a site records
 * here: a device sold, apps installed, a visitor at a promotion. A row
 * recorded in error is reversed, not deleted, and stops counting.
 *
 * EVENTS are planned days at a site: a launch, a roadshow, a collection day
 * for an event. TARGETS are set per site, activity and period, and read
 * against the log as it stands.
 */
export default function SiteActivity() {
  const translate = useT();
  return (
    <Card bodyProps={false}>
      <Tabs isLazy variant="line" colorScheme="brand">
        <TabList px={4} pt={2}>
          <Tab fontSize="sm">{translate('crm.siteActivity.log')}</Tab>
          <Tab fontSize="sm">{translate('crm.siteActivity.events')}</Tab>
          <Tab fontSize="sm">{translate('crm.siteActivity.targets')}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}><Log /></TabPanel>
          <TabPanel px={0}><Events /></TabPanel>
          <TabPanel px={0}><Targets /></TabPanel>
        </TabPanels>
      </Tabs>
    </Card>
  );
}

function Log() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useCrmMeta();
  const sites = useSiteOptions();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);

  const list = useList((params) => crm.siteActivity.list(params), { page: 1, limit: 30, dir: 'desc' });
  const types = (meta.activity_types || []).filter((activityType) => activityType.is_active);

  const record = async (values) => {
    setSaving(true);
    try {
      await crm.siteActivity.record(values);
      toast({ title: translate('crm.siteActivity.recorded'), status: 'success', duration: 2500 });
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

  const reverse = async (row) => {
    const agreed = await confirm({
      tone: 'danger', title: translate('crm.siteActivity.reverse'), body: translate('crm.siteActivity.reverseExplained'),
      detail: translate(row.activity_name || '-') + '  ·  ' + (row.service_center_name || ''), confirmLabel: translate('crm.siteActivity.reverse')
    });
    if (!agreed) return;
    try {
      await crm.siteActivity.reverse(row.service_center_activity_id);
      list.reload();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'service_center_id', label: 'Service location', value: list.params.service_center_id, width: '14rem',
            options: sites, onChange: (value) => list.setFilter({ service_center_id: value || undefined }) },
          { key: 'activity_type_id', label: 'Activity', value: list.params.activity_type_id, width: '13rem',
            options: optionsFrom(meta.activity_types, 'activity_type_id', 'activity_name'),
            onChange: (value) => list.setFilter({ activity_type_id: value || undefined }) },
          { key: 'status', label: 'Status', value: list.params.status, options: choices(['COMPLETED', 'REVERSED', 'CANCELLED']),
            onChange: (value) => list.setFilter({ status: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={form.onOpen}>
            {translate('crm.siteActivity.record')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
            { key: 'service_center_name', label: 'Service location', maxW: '14rem' },
            { key: 'activity_name', label: 'Activity', render: (row) => translate(row.activity_name || '-') },
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name ? row.party_name + '  ' + partyIdLabel(row.party_pk) : '-') },
            { key: 'quantity', label: 'Quantity', isNumeric: true, render: (row) => amount(row.quantity) },
            { key: 'amount', label: 'Amount', isNumeric: true, render: (row) => (row.amount === null || row.amount === undefined ? '-' : money(row.amount, row.currency_code)) },
            { key: 'manager_name', label: 'Recorded by' },
            { key: 'note', label: 'Note', maxW: '14rem' },
            { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.service_center_activity_id || row.id}
          actions={canWrite ? [{ key: 'reverse', label: translate('crm.siteActivity.reverse'), hidden: (row) => row.status !== 'COMPLETED', onClick: reverse }] : []}
          actionsIconOnly={false}
          storageKey={PAGE + '/log'}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.siteActivity.record')}
        initial={{ quantity: 1, occurred_at: localInput(new Date()) }}
        onSubmit={record}
        saving={saving}
        fields={[
          { name: 'service_center_id', label: 'Service location', type: 'select', required: true, options: sites, isSearchable: true },
          { name: 'activity_type_id', label: 'Activity', type: 'select', required: true,
            options: types.map((activityType) => ({ value: activityType.activity_type_id, label: activityType.activity_name })),
            help: 'The service location has to be able to do it - see its capabilities.' },
          { name: 'occurred_at', label: 'When', type: 'datetime-local', required: true },
          { name: 'quantity', label: 'Quantity', type: 'number', step: '0.001' },
          { name: 'amount', label: 'Amount', type: 'number', step: '0.01', help: 'Only counted for activities that measure money, such as a sale.' },
          { name: 'party_pk', label: 'Customer', type: 'custom', colSpan: 'full',
            render: (values, set) => <PartyPicker value={values.party_pk} onChange={(value) => set('party_pk', value)} /> },
          { name: 'note', label: 'Note', type: 'textarea', colSpan: 'full' }
        ]}
      />
    </Box>
  );
}

function Events() {
  const translate = useT();
  const toast = useToast();
  const meta = useCrmMeta();
  const sites = useSiteOptions();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const list = useList((params) => crm.siteActivity.events(params), { page: 1, limit: 20, upcoming: '1', dir: 'asc' });

  const save = async (values) => {
    setSaving(true);
    try {
      if (editing) await crm.siteActivity.updateEvent(editing.service_center_event_id, values);
      else await crm.siteActivity.createEvent(values);
      toast({ title: editing ? translate('Saved') : translate('Created'), status: 'success', duration: 2500 });
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

  const open = (row) => { setEditing(row || null); form.onOpen(); };

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'upcoming', label: 'When', value: list.params.upcoming, options: [{ value: '1', label: 'Upcoming and running' }],
            onChange: (value) => list.setFilter({ upcoming: value || undefined }) },
          { key: 'service_center_id', label: 'Service location', value: list.params.service_center_id, width: '14rem',
            options: sites, onChange: (value) => list.setFilter({ service_center_id: value || undefined }) },
          { key: 'status', label: 'Status', value: list.params.status, options: choices(EVENT_STATUS),
            onChange: (value) => list.setFilter({ status: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={() => open(null)}>
            {translate('crm.siteActivity.planEvent')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'planned_start_at', label: 'Starts', render: (row) => dateTime(row.planned_start_at) },
            { key: 'title', label: 'Event', maxW: '16rem' },
            { key: 'event_type_code', label: 'Kind', render: (row) => word(translate, row.event_type_code) },
            { key: 'service_center_name', label: 'Service location' },
            { key: 'event_name', label: 'Event' },
            { key: 'capacity', label: 'Capacity', isNumeric: true, render: (row) => number(row.capacity) },
            { key: 'attendee_count', label: 'Came', isNumeric: true, render: (row) => number(row.attendee_count) },
            { key: 'activity_cnt', label: 'Activities', isNumeric: true, render: (row) => number(row.activity_cnt) },
            { key: 'status', label: 'Status', render: (row) => <Status value={row.status} /> }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.service_center_event_id || row.id}
          actions={canWrite ? [{ key: 'edit', label: translate('common.edit'), onClick: (row) => open(row) }] : []}
          actionsIconOnly={false}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate(editing ? 'crm.siteActivity.editEvent' : 'crm.siteActivity.planEvent')}
        initial={editing ? Object.assign({}, editing, {
          planned_start_at: localInput(editing.planned_start_at), planned_end_at: localInput(editing.planned_end_at),
          actual_start_at: localInput(editing.actual_start_at), actual_end_at: localInput(editing.actual_end_at)
        }) : { event_type_code: 'PROMOTION_DAY', status: 'PLANNED' }}
        onSubmit={save}
        saving={saving}
        size="3xl"
        fields={[
          { name: 'title', label: 'Event', required: true, colSpan: 'full' },
          { name: 'service_center_id', label: 'Service location', type: 'select', required: true, options: sites, isSearchable: true },
          { name: 'event_type_code', label: 'Kind', type: 'select', required: true, isClearable: false, options: choices(EVENT_TYPES) },
          { name: 'planned_start_at', label: 'Starts', type: 'datetime-local', required: true },
          { name: 'planned_end_at', label: 'Ends', type: 'datetime-local', required: true },
          { name: 'status', label: 'Status', type: 'select', isClearable: false, options: choices(EVENT_STATUS) },
          { name: 'project_id', label: 'Project', type: 'select', options: optionsFrom(meta.projects, 'project_id', 'project_name') },
          { name: 'capacity', label: 'Capacity', type: 'number' },
          { name: 'attendee_count', label: 'Came', type: 'number' },
          { name: 'actual_start_at', label: 'Actually started', type: 'datetime-local' },
          { name: 'actual_end_at', label: 'Actually ended', type: 'datetime-local' },
          { name: 'description', label: 'Description', type: 'textarea', colSpan: 'full' },
          { name: 'outcome_note', label: 'How it went', type: 'textarea', colSpan: 'full' }
        ]}
      />
    </Box>
  );
}

function Targets() {
  const translate = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const meta = useCrmMeta();
  const sites = useSiteOptions();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const list = useList((params) => crm.siteActivity.targets(params), { page: 1, limit: 20, current: '1' });

  const save = async (values) => {
    setSaving(true);
    try {
      if (editing) await crm.siteActivity.updateTarget(editing.service_center_activity_target_id, values);
      else await crm.siteActivity.createTarget(values);
      toast({ title: editing ? translate('Saved') : translate('Created'), status: 'success', duration: 2500 });
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

  const remove = async (row) => {
    const agreed = await confirm({
      tone: 'danger', title: translate('crm.siteActivity.removeTarget'), body: translate('crm.siteActivity.removeTargetExplained'),
      detail: row.service_center_name, confirmLabel: translate('common.remove')
    });
    if (!agreed) return;
    try {
      await crm.siteActivity.removeTarget(row.service_center_activity_target_id);
      list.reload();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  const open = (row) => { setEditing(row || null); form.onOpen(); };

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'current', label: 'Period', value: list.params.current, options: [{ value: '1', label: 'Running now' }],
            onChange: (value) => list.setFilter({ current: value || undefined }) },
          { key: 'service_center_id', label: 'Service location', value: list.params.service_center_id, width: '14rem',
            options: sites, onChange: (value) => list.setFilter({ service_center_id: value || undefined }) },
          { key: 'activity_type_id', label: 'Activity', value: list.params.activity_type_id, width: '13rem',
            options: optionsFrom(meta.activity_types, 'activity_type_id', 'activity_name'),
            onChange: (value) => list.setFilter({ activity_type_id: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={() => open(null)}>
            {translate('crm.siteActivity.setTarget')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'service_center_name', label: 'Service location', maxW: '14rem' },
            { key: 'activity_name', label: 'Activity', render: (row) => translate(row.activity_name || '-') },
            { key: 'period_start', label: 'Period', render: (row) => date(row.period_start) + ' - ' + date(row.period_end) },
            { key: 'quantity_pct', label: 'Done', width: '11rem',
              render: (row) => (row.target_quantity ? (
                <Box>
                  <Progress size="xs" borderRadius="full" value={Math.min(100, Number(row.quantity_pct) || 0)}
                    colorScheme={Number(row.quantity_pct) >= 100 ? 'green' : 'orange'} />
                  <Text fontSize="0.65rem" mt="2px">{amount(row.actual_quantity) + ' / ' + amount(row.target_quantity)}</Text>
                </Box>
              ) : '-') },
            { key: 'amount_pct', label: 'Amount done', width: '11rem',
              render: (row) => (row.target_amount ? amount(row.actual_amount, 2) + ' / ' + amount(row.target_amount, 2) : '-') },
            { key: 'note', label: 'Note', maxW: '14rem' }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.service_center_activity_target_id || row.id}
          actions={canWrite ? [
            { key: 'edit', label: translate('common.edit'), onClick: (row) => open(row) },
            { key: 'remove', label: translate('common.remove'), onClick: remove }
          ] : []}
          actionsIconOnly={false}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate(editing ? 'crm.siteActivity.editTarget' : 'crm.siteActivity.setTarget')}
        initial={editing ? Object.assign({}, editing, {
          period_start: dateInput(editing.period_start), period_end: dateInput(editing.period_end)
        }) : {}}
        onSubmit={save}
        saving={saving}
        fields={[
          { name: 'service_center_id', label: 'Service location', type: 'select', required: true, options: sites, isSearchable: true },
          { name: 'activity_type_id', label: 'Activity', type: 'select', required: true,
            options: optionsFrom(meta.activity_types, 'activity_type_id', 'activity_name') },
          { name: 'period_start', label: 'From', type: 'date', required: true },
          { name: 'period_end', label: 'Until', type: 'date', required: true },
          { name: 'target_quantity', label: 'How many', type: 'number', step: '0.001' },
          { name: 'target_amount', label: 'How much', type: 'number', step: '0.01' },
          { name: 'note', label: 'Note', colSpan: 'full' }
        ]}
      />
    </Box>
  );
}
