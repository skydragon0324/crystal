import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Box, Button, Flex, HStack, Heading, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, SimpleGrid,
  Stack, Tab, TabList, Tabs, Tag, Text, Textarea, useDisclosure, useToast
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

import Card from '../../components/Card';
import DataTable from '../../components/DataTable';
import FormModal from '../../components/FormModal';
import SelectField from '../../components/SelectField';
import Toolbar from '../../components/Toolbar';
import useList from '../../hooks/useList';
import usePermission from '../../hooks/usePermission';
import { crm } from '../../api';
import { useT } from '../../i18n';
import { date, dateTime, money, number } from '../../utils/format';
import { useSurface } from '../../theme/tokens';
import { ProjectTags } from './ui';
import { Fact, Facts, PartyPicker, choices, optionsFrom, useCrmMeta, useSiteOptions, word, filtersFor, translateOptions, partyIdLabel } from './shared';

export const PAGE = '/admin/crm/service-cases';

/**
 * SERVICE CASES - one summary per service event, whichever project ran it.
 *
 * Five tabs: every case, the open ones, the ones past their due date, and the
 * same counted per project and per case type - a row there opens the list
 * narrowed to it. What the CRM adds to a project's own repair records is the
 * reading every project's service has in common - what the customer
 * reported, what was actually wrong, why, and what fixed it.
 *
 * Complaints, enquiries and other non-repair cases are opened here.
 */
const TABS = ['all', 'open', 'overdue', 'project', 'type'];

export default function ServiceCases() {
  const translate = useT();
  const toast = useToast();
  const history = useHistory();
  const location = useLocation();
  const surface = useSurface();
  const meta = useCrmMeta();
  const sites = useSiteOptions();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({});

  const query = new URLSearchParams(location.search);
  const openCase = query.get('case');
  /* ?overdue=1 opens the Overdue tab. */
  const [tab, setTab] = useState(query.get('overdue') === '1' ? 'overdue' : 'all');
  const list = useList((params) => crm.cases.list(params), { page: 1, limit: 20, dir: 'desc', overdue: tab === 'overdue' ? '1' : undefined });

  const loadSummary = useCallback(() => {
    crm.cases.summary().then(({ data }) => setSummary(data || {})).catch(() => setSummary({}));
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const showTab = (next, narrowing) => {
    setTab(next);
    if (next === 'project' || next === 'type') return;
    list.setFilter(Object.assign({ open: next === 'open' ? '1' : undefined, overdue: next === 'overdue' ? '1' : undefined }, narrowing || {}));
  };

  const create = async (values) => {
    setSaving(true);
    try {
      const { data } = await crm.cases.create(values);
      toast({ title: translate('Created'), status: 'success', duration: 2500 });
      form.onClose();
      list.reload();
      loadSummary();
      if (data && data.case_id) history.push(PAGE + '?case=' + data.case_id);
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const counts = summary.counts || {};
  const tabLabels = {
    all: [translate('crm.serviceCases.allCases'), counts.total],
    open: [translate('crm.serviceCases.openCases'), counts.open],
    overdue: [translate('crm.serviceCases.overdue'), counts.overdue],
    project: [translate('crm.serviceCases.byProject')],
    type: [translate('crm.serviceCases.byType')]
  };

  return (
    <Card bodyProps={false}>
      <Flex px={5} pt={4} pb={2} justify="space-between" align="center" wrap="wrap" gap={3} data-gap="12" data-gap-wrap>
        <Box>
          <Heading size="md">{translate('crm.serviceCases.title')}</Heading>
          <Text fontSize="sm" color={surface.muted} mt={0.5}>{translate('crm.serviceCases.lead')}</Text>
        </Box>
        {canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={form.onOpen}>
            {translate('crm.serviceCases.newCase')}
          </Button>
        ) : null}
      </Flex>

      <Tabs index={TABS.indexOf(tab)} onChange={(index) => showTab(TABS[index])} variant="line" colorScheme="brand">
        <TabList px={4}>
          {TABS.map((key) => (
            <Tab key={key} fontSize="sm">
              <HStack spacing={2}>
                <Text as="span">{tabLabels[key][0]}</Text>
                {tabLabels[key][1] === undefined ? null : (
                  <Tag size="sm" borderRadius="full" colorScheme={key === 'overdue' && tabLabels[key][1] > 0 ? 'red' : 'gray'}>{number(tabLabels[key][1])}</Tag>
                )}
              </HStack>
            </Tab>
          ))}
        </TabList>
      </Tabs>

      {tab === 'project' || tab === 'type' ? (
        <CaseSummary rows={tab === 'project' ? summary.by_project || [] : summary.by_type || []} byProject={tab === 'project'}
          onPick={(row) => showTab('all', tab === 'project' ? { project_id: row.project_id, case_type_id: undefined } : { case_type_id: row.case_type_id, project_id: undefined })} />
      ) : (
        <>
          <Toolbar
            search={list.params.q}
            onSearch={(searchText) => list.setFilter({ q: searchText })}
            filters={filtersFor(translate, [
              { key: 'service_status_id', label: 'Status', value: list.params.service_status_id,
                options: optionsFrom(meta.service_statuses, 'service_status_id', 'display_name'),
                onChange: (value) => list.setFilter({ service_status_id: value || undefined }) },
              { key: 'case_type_id', label: 'Type', value: list.params.case_type_id,
                options: optionsFrom(meta.case_types, 'case_type_id', 'display_name'),
                onChange: (value) => list.setFilter({ case_type_id: value || undefined }) },
              { key: 'project_id', label: 'Project', value: list.params.project_id,
                options: optionsFrom(meta.projects, 'project_id', 'project_name'),
                onChange: (value) => list.setFilter({ project_id: value || undefined }) },
              { key: 'service_center_id', label: 'Service location', value: list.params.service_center_id, width: '14rem',
                options: sites, onChange: (value) => list.setFilter({ service_center_id: value || undefined }) },
              { key: 'unclassified', label: 'Classification', value: list.params.unclassified,
                options: [{ value: '1', label: 'Not classified yet' }],
                onChange: (value) => list.setFilter({ unclassified: value || undefined }) }
            ])}
          />
          <Box px="0.5rem" pb="0.5rem">
            <DataTable
              columns={[
                { key: 'external_case_id', label: translate('crm.serviceCases.caseNo'),
                  render: (row) => <Text as="span" fontWeight="600" color="brand.500">{caseNumber(row)}</Text> },
                { key: 'party_name', label: translate('crm.serviceCases.customer'), render: (row) => (
                  <Box>
                    <Text fontSize="sm" noOfLines={1}>{row.party_name || '-'}</Text>
                    <Text fontSize="xs" color={surface.muted}>{partyIdLabel(row.party_pk)}</Text>
                  </Box>
                ) },
                { key: 'project_code', label: translate('crm.serviceCases.project'), render: (row) => <ProjectTags codes={[row.project_code]} /> },
                { key: 'case_type_name', label: translate('crm.serviceCases.type'), render: (row) => translate(row.case_type_name || '-') },
                { key: 'status_name', label: translate('crm.serviceCases.status'), render: (row) => <CaseStatus row={row} /> },
                { key: 'priority_name', label: translate('crm.serviceCases.priority'), render: (row) => <CasePriority row={row} /> },
                { key: 'received_at', label: translate('crm.serviceCases.created'), render: (row) => date(row.received_at) },
                { key: 'due_at', label: translate('crm.serviceCases.due'),
                  render: (row) => <Text as="span" color={isOverdue(row) ? 'red.500' : undefined}>{dateTime(row.due_at)}</Text> }
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
              rowKey={(row) => row.case_id || row.id}
              onRowClick={(row) => history.push(PAGE + '?case=' + (row.case_id || row.id))}
              storageKey={PAGE + ':v2'}
            />
          </Box>
        </>
      )}

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.serviceCases.newCase')}
        initial={{ reception_channel_code: 'PHONE' }}
        onSubmit={create}
        saving={saving}
        fields={[
          { name: 'party_pk', label: 'Customer', type: 'custom', required: true, colSpan: 'full',
            render: (values, set) => <PartyPicker value={values.party_pk} onChange={(value) => set('party_pk', value)} /> },
          { name: 'project_id', label: 'Project', type: 'select', required: true,
            options: optionsFrom(meta.projects, 'project_id', 'project_name') },
          { name: 'case_type_id', label: 'Type', type: 'select', required: true,
            options: optionsFrom(meta.case_types, 'case_type_id', 'display_name') },
          { name: 'reception_channel_code', label: 'Came in by', type: 'select',
            options: choices(['PHONE', 'WALK_IN', 'MAIL_IN', 'ON_SITE', 'COURIER', 'APP', 'WEB', 'AGENCY']) },
          { name: 'service_priority_id', label: 'Priority', type: 'select',
            options: optionsFrom(meta.priorities, 'service_priority_id', 'priority_name') },
          { name: 'service_center_id', label: 'Service location', type: 'select', options: sites, isSearchable: true },
          { name: 'due_at', label: 'Due', type: 'datetime-local' },
          { name: 'title', label: 'Title', colSpan: 'full' },
          { name: 'description', label: 'What the customer said', type: 'textarea', colSpan: 'full' }
        ]}
      />

      <CaseDetail id={openCase} onClose={() => { history.push(PAGE); list.reload(); loadSummary(); }} />
    </Card>
  );
}

/** The project's own case number, or the CRM's when the case was opened here. */
function caseNumber(row) {
  return row.external_case_id || ('SC-' + String(row.case_id).padStart(6, '0'));
}

function isOverdue(row) {
  return !row.is_terminal && row.due_at && new Date(row.due_at).getTime() < Date.now();
}

/* Where a case stands, as a coloured pill: waiting, being worked on, ready, done, dropped. */
const STATUS_SCHEME = {
  RECEIVED: 'blue', DIAGNOSING: 'orange', WAITING_PARTS: 'orange', WAITING_APPROVAL: 'orange', IN_REPAIR: 'orange',
  QUALITY_CHECK: 'orange', READY: 'teal', CLOSED: 'green', CANCELLED: 'gray'
};
const PRIORITY_SCHEME = { LOW: 'gray', NORMAL: 'blue', HIGH: 'orange', URGENT: 'red' };

function CaseStatus({ row }) {
  const translate = useT();
  return (
    <HStack spacing={1}>
      <Tag size="sm" borderRadius="full" variant="subtle" colorScheme={STATUS_SCHEME[row.status_code] || 'gray'}>{translate(row.status_name || '-')}</Tag>
      {isOverdue(row) ? <Tag size="sm" borderRadius="full" variant="subtle" colorScheme="red">{translate('crm.serviceCases.overdue')}</Tag> : null}
    </HStack>
  );
}

function CasePriority({ row }) {
  const translate = useT();
  if (!row.priority_code) return <Text as="span">-</Text>;
  return <Tag size="sm" borderRadius="full" variant="subtle" colorScheme={PRIORITY_SCHEME[row.priority_code] || 'gray'}>{translate(row.priority_name)}</Tag>;
}

/** The By project and By type tabs: the counts per group, a row opening the list narrowed to it. */
function CaseSummary({ rows, byProject, onPick }) {
  const translate = useT();
  return (
    <Box px="0.5rem" py="0.5rem">
      <DataTable
        hidePagination
        rows={rows}
        rowKey={(row) => (byProject ? row.project_id : row.case_type_id)}
        onRowClick={onPick}
        columns={[
          byProject
            ? { key: 'project_name', label: translate('crm.serviceCases.project'),
              render: (row) => <HStack spacing={2}><ProjectTags codes={[row.project_code]} /><Text as="span">{translate(row.project_name)}</Text></HStack> }
            : { key: 'case_type_name', label: translate('crm.serviceCases.type'), render: (row) => translate(row.case_type_name) },
          { key: 'open', label: translate('crm.serviceCases.openCases'), isNumeric: true, render: (row) => number(row.open) },
          { key: 'overdue', label: translate('crm.serviceCases.overdue'), isNumeric: true,
            render: (row) => <Text as="span" color={row.overdue > 0 ? 'red.500' : undefined} fontWeight={row.overdue > 0 ? '700' : undefined}>{number(row.overdue)}</Text> },
          { key: 'closed_30d', label: translate('crm.serviceCases.closed30Days'), isNumeric: true, render: (row) => number(row.closed_30d) },
          { key: 'days_to_close', label: translate('crm.serviceCases.daysToClose'), isNumeric: true, render: (row) => number(row.days_to_close, 1) },
          { key: 'total', label: translate('crm.serviceCases.total'), isNumeric: true, render: (row) => number(row.total) }
        ]}
      />
    </Box>
  );
}

export function CaseDetail({ id, onClose }) {
  const translate = useT();
  const toast = useToast();
  const meta = useCrmMeta();
  const { canWrite } = usePermission(PAGE);
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) { setDetail(null); return; }
    crm.cases.get(id).then(({ data }) => {
      const found = data || {};
      setDetail(found);
      const classification = found.classification || {};
      setDraft({
        issue_category_id: classification.issue_category_id || null,
        fault_category_id: classification.fault_category_id || null,
        root_cause_id: classification.root_cause_id || null,
        resolution_category_id: classification.resolution_category_id || null,
        resolution_text: classification.resolution_text || ''
      });
    }).catch(() => setDetail(null));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const record = detail || {};
  const serviceCase = record.case || {};
  const fromTicket = !!serviceCase.crystal_repair_ticket_id;

  const save = async (work) => {
    setBusy(true);
    try {
      await work();
      toast({ title: translate('Saved'), status: 'success', duration: 2500 });
      load();
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const set = (name, value) => setDraft(Object.assign({}, draft, { [name]: value === undefined ? null : value }));

  const picker = (name, label, list, idKey) => (
    <Box>
      <Text fontSize="xs" mb={1}>{translate(label)}</Text>
      <SelectField
        size="sm"
        options={translateOptions(translate, optionsFrom(list, idKey, 'display_name'))}
        value={draft[name] || null}
        isDisabled={!canWrite}
        onChange={(value) => set(name, value)}
      />
    </Box>
  );

  return (
    /* No focus hand-back on close: focusing the opener scrolled the page (and a tab strip) sideways. */
    <Modal isOpen={!!id} onClose={onClose} size="4xl" scrollBehavior="inside" returnFocusOnClose={false} preserveScrollBarGap>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{serviceCase.external_case_id || serviceCase.title || translate('crm.serviceCases.case')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={5}>
            <Facts>
              <Fact label="Customer">{serviceCase.party_name ? serviceCase.party_name + '  ' + partyIdLabel(serviceCase.party_pk) : null}</Fact>
              <Fact label="Type">{serviceCase.case_type_name ? translate(serviceCase.case_type_name) : null}</Fact>
              <Fact label="Status">{serviceCase.status_name ? translate(serviceCase.status_name) : null}</Fact>
              <Fact label="Project">{serviceCase.project_code}</Fact>
              <Fact label="Site">{serviceCase.service_center_name}</Fact>
              <Fact label="Came in by">{serviceCase.reception_channel_code ? word(translate, serviceCase.reception_channel_code) : null}</Fact>
              <Fact label="Product">{serviceCase.product_name ? serviceCase.product_name + '  ' + (serviceCase.external_product_instance_id || '') : null}</Fact>
              <Fact label="Warranty">{serviceCase.is_warranty ? translate('common.yes') : null}</Fact>
              <Fact label="Received">{dateTime(serviceCase.received_at)}</Fact>
              <Fact label="Due">{dateTime(serviceCase.due_at)}</Fact>
              <Fact label="Completed">{dateTime(serviceCase.completed_at)}</Fact>
              <Fact label="Closed">{dateTime(serviceCase.closed_at)}</Fact>
              <Fact label="Total cost">{serviceCase.total_cost === null || serviceCase.total_cost === undefined ? null : money(serviceCase.total_cost, serviceCase.currency_code)}</Fact>
              <Fact label="Customer paid">{serviceCase.customer_paid_amount === null || serviceCase.customer_paid_amount === undefined ? null : money(serviceCase.customer_paid_amount, serviceCase.currency_code)}</Fact>
              <Fact label="Satisfaction">{serviceCase.satisfaction_rating}</Fact>
            </Facts>

            {serviceCase.description ? <Text fontSize="sm" whiteSpace="pre-wrap">{serviceCase.description}</Text> : null}

            {fromTicket ? (
              <Text fontSize="sm">{translate('crm.serviceCases.followsTicket')}</Text>
            ) : (canWrite && serviceCase.case_id ? (
              <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.serviceCases.moveTo')}</Text>
                <SelectField
                  size="sm"
                  options={translateOptions(translate, optionsFrom(meta.service_statuses, 'service_status_id', 'display_name'))}
                  value={serviceCase.service_status_id || null}
                  isClearable={false}
                  onChange={(value) => value && save(() => crm.cases.update(serviceCase.case_id, { service_status_id: value }))}
                />
              </Box>
            ) : null)}

            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.serviceCases.classification')}</Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                {picker('issue_category_id', 'What the customer reported', meta.issue_categories, 'issue_category_id')}
                {picker('fault_category_id', 'What was actually wrong', meta.fault_categories, 'fault_category_id')}
                {picker('root_cause_id', 'Why', meta.root_causes, 'root_cause_id')}
                {picker('resolution_category_id', 'What fixed it', meta.resolution_categories, 'resolution_category_id')}
              </SimpleGrid>
              <Textarea
                mt={3} size="sm" rows={3}
                value={draft.resolution_text || ''}
                isReadOnly={!canWrite}
                placeholder={translate('crm.serviceCases.resolutionNotes')}
                onChange={(event) => set('resolution_text', event.target.value)}
              />
              {canWrite && serviceCase.case_id ? (
                <Button mt={3} size="sm" variant="brand" isLoading={busy}
                  onClick={() => save(() => crm.cases.classify(serviceCase.case_id, draft))}>
                  {translate('crm.serviceCases.saveClassification')}
                </Button>
              ) : null}
              {record.classification && record.classification.classified_by_name ? (
                <Text fontSize="xs" mt={2}>
                  {translate('crm.serviceCases.classifiedBy', { name: record.classification.classified_by_name, when: dateTime(record.classification.classified_at) })}
                </Text>
              ) : null}
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.serviceCases.atTheSite')}</Text>
              <DataTable
                hidePagination
                rows={record.activities || []}
                rowKey={(row) => row.service_center_activity_id}
                columns={[
                  { key: 'occurred_at', label: 'When', render: (row) => dateTime(row.occurred_at) },
                  { key: 'activity_name', label: 'Activity', render: (row) => translate(row.activity_name || '-') },
                  { key: 'service_center_name', label: 'Service location' }
                ]}
              />
            </Box>
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
