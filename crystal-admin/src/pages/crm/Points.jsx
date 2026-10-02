import React, { useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Tab, TabList, TabPanel, TabPanels, Tabs, useDisclosure, useToast
} from '@chakra-ui/react';

import Card from '../../components/Card';
import CrudPage from '../../components/CrudPage';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { dateTime } from '../../utils/format';
import { PartyPicker, Status, amount, choices, optionsFrom, rowsOf, useCatalogOptions, useCrmMeta, word, filtersFor } from './shared';

export const PAGE = '/admin/crm/points';

const TRIGGERS = ['PRODUCT_REGISTRATION', 'DAILY_LOGIN', 'DUTY', 'PURCHASE', 'LICENCE_PURCHASE', 'APP_PURCHASE',
  'REPAIR', 'SURVEY', 'BLOG', 'MANUAL', 'PROGRAM_AWARD'];

/**
 * REWARD POINTS - every currency, one ledger.
 *
 * A balance is per customer AND per point type, never a sum across types:
 * activity points, software points and Crystal points buy different things,
 * so adding them together would give a number nothing can be spent from.
 *
 * Nothing here edits a balance. A movement made in error is answered by an
 * adjustment that says why, and both stay on the ledger. If a balance ever
 * stops equalling the sum of its ledger, the warning at the top says so -
 * that should never happen, and seeing it is how it would be noticed.
 */
export default function Points() {
  const t = useT();
  const [drift, setDrift] = useState([]);

  useEffect(() => {
    crm.points.drift().then(({ data }) => setDrift(rowsOf(data))).catch(() => setDrift([]));
  }, []);

  return (
    <Box>
      {drift.length ? (
        <Alert status="error" mb={4} borderRadius="md" fontSize="sm">
          <AlertIcon />
          {t('crm.points.drifted', { n: drift.length })}
        </Alert>
      ) : null}
      <Card bodyProps={false}>
        <Tabs isLazy variant="line" colorScheme="brand">
          <TabList px={4} pt={2}>
            <Tab fontSize="sm">{t('crm.points.balances')}</Tab>
            <Tab fontSize="sm">{t('crm.points.ledger')}</Tab>
            <Tab fontSize="sm">{t('crm.points.earningRules')}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}><Balances /></TabPanel>
            <TabPanel px={0}><Ledger /></TabPanel>
            <TabPanel px={0}><Rules /></TabPanel>
          </TabPanels>
        </Tabs>
      </Card>
    </Box>
  );
}

function Balances() {
  const t = useT();
  const toast = useToast();
  const meta = useCrmMeta();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);

  const list = useList((params) => crm.points.accounts(params), { page: 1, limit: 20, sort: 'balance', dir: 'desc' });
  const summary = list.summary || {};

  const adjust = async (values) => {
    setSaving(true);
    try {
      await crm.points.adjust(values);
      toast({ title: t('crm.points.adjusted'), status: 'success', duration: 2500 });
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

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(t, [
          { key: 'point_type_id', label: 'Point type', value: list.params.point_type_id, width: '14rem',
            options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name'),
            onChange: (value) => list.setFilter({ point_type_id: value || undefined }) },
          { key: 'nonzero', label: 'Balance', value: list.params.nonzero,
            options: [{ value: '1', label: 'Not zero' }],
            onChange: (value) => list.setFilter({ nonzero: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" onClick={form.onOpen}>{t('crm.points.adjust')}</Button>
        ) : null}
      />
      {list.params.point_type_id ? (
        <Box px={5} pb={2} fontSize="sm">
          {t('crm.points.totals', {
            balance: amount(summary.balance, 0), earned: amount(summary.earned, 0), spent: amount(summary.spent, 0)
          })}
        </Box>
      ) : null}
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', sortable: false,
              render: (row) => (row.party_name || '-') + '  ' + (row.party_no || '') },
            { key: 'point_type_name', label: 'Point type', sortable: false, render: (row) => t(row.point_type_name || '-') },
            { key: 'balance', label: 'Balance', isNumeric: true, render: (row) => amount(row.balance, row.decimal_places) },
            { key: 'lifetime_earned', label: 'Earned', isNumeric: true, render: (row) => amount(row.lifetime_earned) },
            { key: 'lifetime_spent', label: 'Spent', isNumeric: true, sortable: false, render: (row) => amount(row.lifetime_spent) },
            { key: 'last_event_at', label: 'Last movement', render: (row) => dateTime(row.last_event_at) }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          sort={list.params.sort}
          dir={list.params.dir}
          onSort={list.setSort}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.point_account_id || row.id}
          renderExpanded={(row) => <AccountLedger accountId={row.point_account_id} />}
          storageKey={PAGE + '/balances'}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={t('crm.points.adjust')}
        onSubmit={adjust}
        saving={saving}
        fields={[
          { name: 'party_id', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
            render: (values, set) => <PartyPicker value={values.party_id} onChange={(value) => set('party_id', value)} /> },
          { name: 'point_type_id', label: 'Point type', type: 'select', required: true,
            options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name') },
          { name: 'points_delta', label: 'Points', type: 'number', required: true, step: '0.001',
            help: 'Positive adds, negative takes away. A balance cannot go below zero.' },
          { name: 'description', label: 'Reason', type: 'textarea', required: true, colSpan: 'full' }
        ]}
      />
    </Box>
  );
}

function AccountLedger({ accountId }) {
  const t = useT();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!accountId) return;
    crm.points.events({ point_account_id: accountId, limit: 15 })
      .then(({ data }) => setRows(rowsOf(data))).catch(() => setRows([]));
  }, [accountId]);

  return (
    <DataTable
      hidePagination
      rows={rows}
      rowKey={(row) => row.point_event_id}
      columns={[
        { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
        { key: 'event_code', label: 'Movement', render: (row) => word(t, row.event_code) },
        { key: 'points_delta', label: 'Change', isNumeric: true, render: (row) => amount(row.points_delta) },
        { key: 'points_balance_after', label: 'Balance', isNumeric: true, render: (row) => amount(row.points_balance_after) },
        { key: 'description', label: 'Note', maxW: '18rem' }
      ]}
    />
  );
}

function Ledger() {
  const t = useT();
  const meta = useCrmMeta();
  const list = useList((params) => crm.points.events(params), { page: 1, limit: 30, dir: 'desc' });

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(t, [
          { key: 'point_type_id', label: 'Point type', value: list.params.point_type_id, width: '14rem',
            options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name'),
            onChange: (value) => list.setFilter({ point_type_id: value || undefined }) },
          { key: 'point_event_type_id', label: 'Movement', value: list.params.point_event_type_id,
            options: (meta.point_event_types || []).map((eventType) => ({ value: eventType.point_event_type_id, label: word(t, eventType.event_code) })),
            onChange: (value) => list.setFilter({ point_event_type_id: value || undefined }) },
          { key: 'project_id', label: 'Project', value: list.params.project_id,
            options: optionsFrom(meta.projects, 'project_id', 'project_code'),
            onChange: (value) => list.setFilter({ project_id: value || undefined }) }
        ])}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + (row.party_no || '') },
            { key: 'point_type_code', label: 'Point type' },
            { key: 'event_code', label: 'Movement', render: (row) => word(t, row.event_code) },
            { key: 'points_delta', label: 'Change', isNumeric: true, render: (row) => amount(row.points_delta) },
            { key: 'points_balance_after', label: 'Balance', isNumeric: true, render: (row) => amount(row.points_balance_after) },
            { key: 'rule_name', label: 'Rule' },
            { key: 'project_code', label: 'Project' },
            { key: 'manager_name', label: 'By' },
            { key: 'description', label: 'Note', maxW: '16rem' }
          ]}
          rows={list.rows}
          loading={list.loading}
          page={list.params.page}
          limit={list.params.limit}
          total={list.total}
          onPageChange={list.setPage}
          onLimitChange={(limit) => list.setFilter({ limit: limit })}
          rowKey={(row) => row.point_event_id || row.id}
          storageKey={PAGE + '/ledger'}
        />
      </Box>
    </Box>
  );
}

function Rules() {
  const t = useT();
  const meta = useCrmMeta();
  const catalog = useCatalogOptions();

  return (
    <CrudPage
      page={PAGE}
      api={crm.pointRules}
      pkField="point_rule_id"
      canRestore={false}
      defaultSort="rule_code"
      subtitle={t('crm.points.rulesExplained')}
      columns={[
        { key: 'rule_code', label: 'Code' },
        { key: 'rule_name', label: 'Rule', maxW: '16rem' },
        { key: 'trigger_code', label: 'When', render: (row) => word(t, row.trigger_code) },
        { key: 'point_type_code', label: 'Point type', sortable: false },
        { key: 'points', label: 'Points', isNumeric: true, render: (row) => amount(row.points) },
        { key: 'class_code', label: 'For class', sortable: false },
        { key: 'product_name', label: 'For product', sortable: false },
        { key: 'project_code', label: 'Project', sortable: false },
        { key: 'event_cnt', label: 'Paid out', sortable: false, isNumeric: true },
        { key: 'is_active', label: 'Status', sortable: false, render: (row) => <Status value={row.is_active ? 'ACTIVE' : 'INACTIVE'} /> }
      ]}
      fields={[
        { name: 'rule_code', label: 'Code', required: true },
        { name: 'rule_name', label: 'Rule', required: true },
        { name: 'trigger_code', label: 'When', type: 'select', required: true, options: choices(TRIGGERS) },
        { name: 'point_type_id', label: 'Point type', type: 'select', required: true,
          options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name') },
        { name: 'points', label: 'Points', type: 'number', required: true, step: '0.001' },
        { name: 'project_id', label: 'Only in project', type: 'select',
          options: optionsFrom(meta.projects, 'project_id', 'project_name') },
        { name: 'product_class_id', label: 'For product class', type: 'select',
          options: optionsFrom(meta.product_classes, 'product_class_id', 'class_name'),
          help: 'A class also covers every class under it. A rule for one product beats a rule for its class.' },
        { name: 'product_id', label: 'For one product', type: 'select', options: catalog, isSearchable: true },
        { name: 'daily_cap_count', label: 'At most this many times a day', type: 'number' },
        { name: 'valid_from', label: 'From', type: 'date' },
        { name: 'valid_to', label: 'Until', type: 'date' },
        { name: 'main_type', label: 'Vendor main type' },
        { name: 'sub_type', label: 'Vendor sub type' },
        { name: 'is_active', label: 'In use', type: 'checkbox' }
      ]}
      emptyRow={{ is_active: true, trigger_code: 'PRODUCT_REGISTRATION' }}
    />
  );
}
