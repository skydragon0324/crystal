import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, HStack, Icon, Tab, TabList, TabPanel, TabPanels, Tabs, Text, useDisclosure, useToast
} from '@chakra-ui/react';
import * as Md from 'react-icons/md';

import Card from '../../../components/Card';
import CrudPage from '../../../components/CrudPage';
import DataTable from '../../../components/DataTable';
import FormModal from '../../../components/FormModal';
import Toolbar from '../../../components/Toolbar';
import useList from '../../../hooks/useList';
import usePermission from '../../../hooks/usePermission';
import { crm } from '../../../api';
import { useT } from '../../../i18n';
import { dateTime } from '../../../utils/format';
import { PartyPicker, Status, amount, choices, optionsFrom, rowsOf, useCatalogOptions, useCrmMeta, word, filtersFor, partyIdLabel, useOpenCustomer } from '../shared/shared';
import { PartyRewardPoints, SHOW_CRM_LEDGER, scoreNote } from './RewardPoints';

export const PAGE = '/admin/crm/points';

const TRIGGERS = ['PRODUCT_REGISTRATION', 'DAILY_LOGIN', 'DUTY', 'PURCHASE', 'LICENCE_PURCHASE', 'APP_PURCHASE',
  'REPAIR', 'SURVEY', 'BLOG', 'MANUAL', 'EVENT_AWARD'];

/**
 * REWARD POINTS.
 *
 * Each business system keeps its own reward points by its own rules. The CRM
 * keeps only how many points each customer's linked accounts hold there
 * (crm_reward_points), and from those and each project's point weight
 * (Settings > Projects) works out a company-wide score - never stored. The
 * list is one line per customer; opening a line shows the rows behind it.
 *
 * The CRM's own points ledger - its earning rules, event costs and awards -
 * is not part of that score and is set aside for now (SHOW_CRM_LEDGER). Its
 * tabs below are kept as they were for when it comes back:
 *
 * A ledger balance is per customer AND per point type, never a sum across types:
 * activity points, software points and Crystal points buy different things,
 * so adding them together would give a number nothing can be spent from.
 *
 * Nothing there edits a balance. A movement made in error is answered by an
 * adjustment that says why, and both stay on the ledger. If a balance ever
 * stops equalling the sum of its ledger, the warning at the top says so -
 * that should never happen, and seeing it is how it would be noticed.
 */
export default function Points() {
  const translate = useT();
  const [drift, setDrift] = useState([]);

  useEffect(() => {
    if (!SHOW_CRM_LEDGER) return;
    crm.points.drift().then(({ data }) => setDrift(rowsOf(data))).catch(() => setDrift([]));
  }, []);

  if (!SHOW_CRM_LEDGER) {
    return <Card bodyProps={false}><CompanyPoints /></Card>;
  }
  return (
    <Box>
      {drift.length ? (
        <Alert status="error" mb={4} borderRadius="md" fontSize="sm">
          <AlertIcon />
          {translate('crm.points.drifted', { n: drift.length })}
        </Alert>
      ) : null}
      <Card bodyProps={false}>
        <Tabs isLazy variant="line" colorScheme="brand">
          <TabList px={4} pt={2}>
            <Tab fontSize="sm">{translate('crm.points.rewardPoints')}</Tab>
            <Tab fontSize="sm">{translate('crm.points.balances')}</Tab>
            <Tab fontSize="sm">{translate('crm.points.ledger')}</Tab>
            <Tab fontSize="sm">{translate('crm.points.earningRules')}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}><CompanyPoints /></TabPanel>
            <TabPanel px={0}><Balances /></TabPanel>
            <TabPanel px={0}><Ledger /></TabPanel>
            <TabPanel px={0}><Rules /></TabPanel>
          </TabPanels>
        </Tabs>
      </Card>
    </Box>
  );
}

/**
 * One line per customer with points anywhere: their company-wide score,
 * worked out now. Opening a line shows each business system's account,
 * points, weight and what they count for. Rows are entered on the customer;
 * a sheet of Project code, Account ID, Points (and As of) loads many at once.
 */
function CompanyPoints() {
  const translate = useT();
  const toast = useToast();
  const meta = useCrmMeta();
  const openCustomer = useOpenCustomer();
  const { canWrite } = usePermission(PAGE);
  const picker = useRef(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);
  const list = useList((params) => crm.rewardPoints.customers(params), { page: 1, limit: 20, sort: 'company_points', dir: 'desc' });

  const downloadTemplate = async () => {
    try {
      const { data: blob } = await crm.rewardPoints.template();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'crm-reward-points-template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    }
  };

  const upload = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const { data } = await crm.rewardPoints.importSheet(file);
      setReport(data);
      list.reload();
    } catch (error) {
      toast({ title: error.message, description: Array.isArray(error.detail) ? error.detail.join(', ') : undefined, status: 'error', duration: 8000, isClosable: true });
    } finally {
      setImporting(false);
    }
  };

  const systemsOf = (row) => {
    const counts = { counted_systems: Number(row.counted_systems), uncounted_systems: Number(row.uncounted_systems) };
    return counts.uncounted_systems ? <Text as="span" color="orange.500">{scoreNote(translate, counts)}</Text> : scoreNote(translate, counts);
  };

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        placeholder={translate('crm.points.searchCustomerOrAccount')}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'project_id', label: 'Business system', value: list.params.project_id, width: '13rem',
            options: optionsFrom(meta.projects, 'project_id', 'project_name'),
            onChange: (value) => list.setFilter({ project_id: value || undefined }) }
        ])}
        actions={canWrite ? (
          <HStack spacing={2}>
            <Button size="sm" variant="outline" leftIcon={<Icon as={Md.MdFileDownload} />} onClick={downloadTemplate}>{translate('crm.points.template')}</Button>
            <Button size="sm" variant="brand" leftIcon={<Icon as={Md.MdFileUpload} />} isLoading={importing} onClick={() => picker.current && picker.current.click()}>
              {translate('crm.points.importPoints')}
            </Button>
            <input ref={picker} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={upload} />
          </HStack>
        ) : null}
      />
      {report ? (
        <Box px={5} pb={3}>
          <Alert status={report.problems && report.problems.length ? 'warning' : 'success'} borderRadius="md" fontSize="sm" alignItems="flex-start">
            <AlertIcon />
            <Box flex="1">
              <Text>{translate('crm.points.importResult', {
                received: report.received, updated: report.updated, unchanged: report.unchanged,
                stale: report.stale, unknown: report.unknown_accounts, invalid: report.invalid
              })}</Text>
              {report.problems && report.problems.length ? (
                <Box mt={2} maxH="12rem" overflowY="auto">
                  {report.problems.map((problem, index) => (
                    <Text key={index} fontSize="xs">{translate('crm.points.rowN', { n: problem.row })}  {problem.external_account_id || ''}  —  {problem.message}</Text>
                  ))}
                </Box>
              ) : null}
            </Box>
            <Button size="xs" variant="ghost" onClick={() => setReport(null)}>{translate('Close')}</Button>
          </Alert>
        </Box>
      ) : null}
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'display_name', label: 'Customer',
              render: (row) => (
                <Text as="span" color="brand.500" cursor="pointer" onClick={(event) => { event.stopPropagation(); openCustomer(row.party_pk); }}>
                  {(row.display_name || '-') + '  ' + partyIdLabel(row.party_pk)}
                </Text>
              ) },
            { key: 'company_points', label: 'Company-wide points', isNumeric: true,
              render: (row) => <Text as="span" fontWeight="700">{amount(row.company_points, 2)}</Text> },
            { key: 'counted_systems', label: 'Business systems', sortable: false, render: systemsOf }
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
          rowKey={(row) => row.party_pk}
          renderExpanded={(row) => <PartyRewardPoints partyPk={row.party_pk} />}
          emptyText={translate('crm.points.noPointsAnywhere')}
          storageKey={PAGE + '/company-points'}
        />
      </Box>
    </Box>
  );
}

function Balances() {
  const translate = useT();
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
      toast({ title: translate('crm.points.adjusted'), status: 'success', duration: 2500 });
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
        filters={filtersFor(translate, [
          { key: 'point_type_id', label: 'Point type', value: list.params.point_type_id, width: '14rem',
            options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name'),
            onChange: (value) => list.setFilter({ point_type_id: value || undefined }) },
          { key: 'nonzero', label: 'Balance', value: list.params.nonzero,
            options: [{ value: '1', label: 'Not zero' }],
            onChange: (value) => list.setFilter({ nonzero: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" onClick={form.onOpen}>{translate('crm.points.adjust')}</Button>
        ) : null}
      />
      {list.params.point_type_id ? (
        <Box px={5} pb={2} fontSize="sm">
          {translate('crm.points.totals', {
            balance: amount(summary.balance, 0), earned: amount(summary.earned, 0), spent: amount(summary.spent, 0)
          })}
        </Box>
      ) : null}
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'party_name', label: 'Customer', sortable: false,
              render: (row) => (row.party_name || '-') + '  ' + partyIdLabel(row.party_pk) },
            { key: 'point_type_name', label: 'Point type', sortable: false, render: (row) => translate(row.point_type_name || '-') },
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
        title={translate('crm.points.adjust')}
        onSubmit={adjust}
        saving={saving}
        fields={[
          { name: 'party_pk', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
            render: (values, set) => <PartyPicker value={values.party_pk} onChange={(value) => set('party_pk', value)} /> },
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
  const translate = useT();
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
        { key: 'event_code', label: 'Movement', render: (row) => word(translate, row.event_code) },
        { key: 'points_delta', label: 'Change', isNumeric: true, render: (row) => amount(row.points_delta) },
        { key: 'points_balance_after', label: 'Balance', isNumeric: true, render: (row) => amount(row.points_balance_after) },
        { key: 'description', label: 'Note', maxW: '18rem' }
      ]}
    />
  );
}

function Ledger() {
  const translate = useT();
  const meta = useCrmMeta();
  const list = useList((params) => crm.points.events(params), { page: 1, limit: 30, dir: 'desc' });

  return (
    <Box>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'point_type_id', label: 'Point type', value: list.params.point_type_id, width: '14rem',
            options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name'),
            onChange: (value) => list.setFilter({ point_type_id: value || undefined }) },
          { key: 'point_event_type_id', label: 'Movement', value: list.params.point_event_type_id,
            options: (meta.point_event_types || []).map((eventType) => ({ value: eventType.point_event_type_id, label: word(translate, eventType.event_code) })),
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
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + partyIdLabel(row.party_pk) },
            { key: 'point_type_code', label: 'Point type' },
            { key: 'event_code', label: 'Movement', render: (row) => word(translate, row.event_code) },
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
  const translate = useT();
  const meta = useCrmMeta();
  const catalog = useCatalogOptions();

  return (
    <CrudPage
      page={PAGE}
      api={crm.pointRules}
      pkField="point_rule_id"
      canRestore={false}
      defaultSort="rule_code"
      subtitle={translate('crm.points.rulesExplained')}
      columns={[
        { key: 'rule_code', label: 'Code' },
        { key: 'rule_name', label: 'Rule', maxW: '16rem' },
        { key: 'trigger_code', label: 'When', render: (row) => word(translate, row.trigger_code) },
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
