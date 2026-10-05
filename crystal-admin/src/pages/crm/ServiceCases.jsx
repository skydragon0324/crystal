import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  Box, Button, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, SimpleGrid,
  Stack, Text, Textarea, useDisclosure, useToast
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
import { dateTime, money } from '../../utils/format';
import { Fact, Facts, PartyPicker, choices, optionsFrom, useCrmMeta, useSiteOptions, word, filtersFor, translateOptions, partyIdLabel } from './shared';

export const PAGE = '/admin/crm/service-cases';

/**
 * SERVICE CASES - one summary per service event, whichever project ran it.
 *
 * Crystal's repair tickets arrive here through the import and stay tickets:
 * the bench, the parts and the claim are on the ticket screen, and a case
 * that mirrors a ticket is not edited here. What the CRM adds is the reading
 * every project's service has in common - what the customer reported, what
 * was actually wrong, why, and what fixed it - so a fault can be counted
 * across Crystal's centres and the vendor's agencies in one place.
 *
 * Complaints, enquiries and other non-repair cases are opened here.
 */
export default function ServiceCases() {
  const translate = useT();
  const toast = useToast();
  const history = useHistory();
  const location = useLocation();
  const meta = useCrmMeta();
  const sites = useSiteOptions();
  const form = useDisclosure();
  const { canWrite } = usePermission(PAGE);
  const [saving, setSaving] = useState(false);

  const openCase = new URLSearchParams(location.search).get('case');
  const list = useList((params) => crm.cases.list(params), { page: 1, limit: 20, open: '1', dir: 'desc' });

  const create = async (values) => {
    setSaving(true);
    try {
      const { data } = await crm.cases.create(values);
      toast({ title: translate('Created'), status: 'success', duration: 2500 });
      form.onClose();
      list.reload();
      if (data && data.case_id) history.push(PAGE + '?case=' + data.case_id);
      return true;
    } catch (error) {
      toast({ title: error.message, status: 'error', duration: 6000, isClosable: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const crystal = (meta.projects || []).filter((project) => project.project_code === 'CRYSTAL')[0];

  return (
    <Card bodyProps={false}>
      <Toolbar
        search={list.params.q}
        onSearch={(searchText) => list.setFilter({ q: searchText })}
        filters={filtersFor(translate, [
          { key: 'open', label: 'Open or all', value: list.params.open,
            options: [{ value: '1', label: 'Open only' }],
            onChange: (value) => list.setFilter({ open: value || undefined }) },
          { key: 'service_status_id', label: 'Status', value: list.params.service_status_id,
            options: optionsFrom(meta.service_statuses, 'service_status_id', 'display_name'),
            onChange: (value) => list.setFilter({ service_status_id: value || undefined }) },
          { key: 'case_type_id', label: 'Type', value: list.params.case_type_id,
            options: optionsFrom(meta.case_types, 'case_type_id', 'display_name'),
            onChange: (value) => list.setFilter({ case_type_id: value || undefined }) },
          { key: 'project_id', label: 'Project', value: list.params.project_id,
            options: optionsFrom(meta.projects, 'project_id', 'project_code'),
            onChange: (value) => list.setFilter({ project_id: value || undefined }) },
          { key: 'service_center_id', label: 'Service location', value: list.params.service_center_id, width: '14rem',
            options: sites, onChange: (value) => list.setFilter({ service_center_id: value || undefined }) },
          { key: 'unclassified', label: 'Classification', value: list.params.unclassified,
            options: [{ value: '1', label: 'Not classified yet' }],
            onChange: (value) => list.setFilter({ unclassified: value || undefined }) }
        ])}
        actions={canWrite ? (
          <Button size="sm" variant="brand" leftIcon={<AddIcon w="0.5625rem" h="0.5625rem" />} onClick={form.onOpen}>
            {translate('crm.cases.newCase')}
          </Button>
        ) : null}
      />
      <Box px="0.5rem" pb="0.5rem">
        <DataTable
          columns={[
            { key: 'external_case_id', label: 'Case', render: (row) => row.external_case_id || ('#' + row.case_id) },
            { key: 'party_name', label: 'Customer', render: (row) => (row.party_name || '-') + '  ' + partyIdLabel(row.party_pk) },
            { key: 'case_type_name', label: 'Type', render: (row) => translate(row.case_type_name || '-') },
            { key: 'status_name', label: 'Status', render: (row) => translate(row.status_name || '-') },
            { key: 'service_center_name', label: 'Service location', maxW: '12rem' },
            { key: 'product_name', label: 'Product' },
            { key: 'is_classified', label: 'Classified', render: (row) => (row.is_classified ? translate('common.yes') : '-') },
            { key: 'received_at', label: 'Received', render: (row) => dateTime(row.received_at) },
            { key: 'due_at', label: 'Due', render: (row) => dateTime(row.due_at) }
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
          storageKey={PAGE}
        />
      </Box>

      <FormModal
        isOpen={form.isOpen}
        onClose={form.onClose}
        title={translate('crm.cases.newCase')}
        initial={{ project_id: crystal ? crystal.project_id : null, reception_channel_code: 'PHONE' }}
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

      <CaseDetail id={openCase} onClose={() => { history.push(PAGE); list.reload(); }} />
    </Card>
  );
}

function CaseDetail({ id, onClose }) {
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
    <Modal isOpen={!!id} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{serviceCase.external_case_id || serviceCase.title || translate('crm.cases.case')}</ModalHeader>
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
              <Text fontSize="sm">{translate('crm.cases.followsTicket')}</Text>
            ) : (canWrite && serviceCase.case_id ? (
              <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.cases.moveTo')}</Text>
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
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.cases.classification')}</Text>
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
                placeholder={translate('crm.cases.resolutionNotes')}
                onChange={(event) => set('resolution_text', event.target.value)}
              />
              {canWrite && serviceCase.case_id ? (
                <Button mt={3} size="sm" variant="brand" isLoading={busy}
                  onClick={() => save(() => crm.cases.classify(serviceCase.case_id, draft))}>
                  {translate('crm.cases.saveClassification')}
                </Button>
              ) : null}
              {record.classification && record.classification.classified_by_name ? (
                <Text fontSize="xs" mt={2}>
                  {translate('crm.cases.classifiedBy', { name: record.classification.classified_by_name, when: dateTime(record.classification.classified_at) })}
                </Text>
              ) : null}
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="600" mb={2}>{translate('crm.cases.atTheSite')}</Text>
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
